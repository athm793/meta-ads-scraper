import type { Page } from 'playwright';
import { launchBrowser, createContext, randomDelay } from './browser';
import { parseGraphQLResponse } from './parser';
import type { Ad, SearchParams } from '@/types/ads';

const ADS_LIBRARY_BASE = 'https://www.facebook.com/ads/library/';

function buildUrl(params: SearchParams): string {
  const url = new URL(ADS_LIBRARY_BASE);

  const statusMap: Record<string, string> = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ALL: 'all',
  };
  url.searchParams.set('active_status', statusMap[params.status ?? 'ALL'] ?? 'all');
  url.searchParams.set('ad_type', params.ad_type && params.ad_type !== 'unknown' ? params.ad_type : 'all');
  url.searchParams.set('country', params.country || 'ALL');

  const query = params.keyword || params.advertiser;
  if (!query) throw new Error('keyword or advertiser required');
  url.searchParams.set('q', query);
  url.searchParams.set('search_type', 'keyword_unordered');

  if (params.category && params.category !== 'ALL') {
    const catMap: Record<string, string> = {
      POLITICAL: 'political_and_issue_ads',
      HOUSING: 'housing',
      EMPLOYMENT: 'employment',
      CREDIT: 'credit',
    };
    const mapped = catMap[params.category];
    if (mapped) url.searchParams.set('ad_category', mapped);
  }

  return url.toString();
}

async function handleCookieConsent(page: Page): Promise<void> {
  const selectors = [
    '[data-testid="cookie-policy-manage-dialog-accept-button"]',
    'button:has-text("Allow all cookies")',
    'button:has-text("Accept all")',
    'button:has-text("Allow essential and optional cookies")',
    'button:has-text("OK")',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await randomDelay(800, 1500);
        return;
      }
    } catch { /* skip */ }
  }
}

function extractFromHtml(html: string, jobId?: string, seen?: Set<string>): Ad[] {
  // Facebook SSR embeds ad data in <script type="application/json" data-sjs="">
  const ads: Ad[] = [];
  const seenLocal = seen ?? new Set<string>();

  // Find all matching script tags
  const scriptRe = /<script[^>]+data-sjs[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    const content = match[1];
    if (!content.includes('ad_archive_id')) continue;

    try {
      const json = JSON.parse(content);
      for (const ad of parseGraphQLResponse(json, jobId)) {
        if (!seenLocal.has(ad.id)) {
          seenLocal.add(ad.id);
          ads.push(ad);
        }
      }
    } catch { /* malformed JSON */ }
  }

  return ads;
}

export async function* scrapeAds(
  params: SearchParams,
  jobId?: string
): AsyncGenerator<Ad[], void, unknown> {
  if (!params.keyword && !params.advertiser) return;

  const limit = params.limit || 100;
  const seen = new Set<string>();
  const collectedAds: Ad[] = [];
  const pendingJsons: unknown[] = [];

  const browser = await launchBrowser(true);
  const context = await createContext(browser);
  const page = await context.newPage();

  let rawHtml = '';

  // Intercept ALL responses:
  // 1. The main page HTML (SSR data) — captured as raw text before React hydrates it
  // 2. GraphQL POSTs (pagination on scroll)
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const status = response.status();
      if (status !== 200) return;

      const method = response.request().method();

      // Capture the raw main page HTML response (SSR ad data is embedded here)
      if (method === 'GET' && url.includes('ads/library') && !rawHtml) {
        const text = await response.text().catch(() => '');
        if (text.includes('ad_archive_id')) {
          rawHtml = text;
        }
        return;
      }

      // Capture scroll-triggered GraphQL POST responses (pagination)
      if (method === 'POST' && url.includes('/api/graphql')) {
        const text = await response.text().catch(() => '');
        if (!text.includes('ad_archive_id')) return;
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (t[0] !== '{') continue;
          try { pendingJsons.push(JSON.parse(t)); } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
  });

  try {
    const targetUrl = buildUrl(params);
    console.log('[scraper] navigating to:', targetUrl);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 4500);
    await handleCookieConsent(page);
    await randomDelay(1000, 2000);

    // Extract initial batch from raw SSR HTML (captured in response handler above)
    const initialBatch = rawHtml ? extractFromHtml(rawHtml, jobId, seen) : [];
    console.log('[scraper] initial HTML batch:', initialBatch.length, 'ads (rawHtml captured:', !!rawHtml, ')');

    if (initialBatch.length > 0) {
      collectedAds.push(...initialBatch);
      yield initialBatch;
    }

    // Scroll to trigger pagination GraphQL POSTs
    let noNewCount = 0;
    const maxScrolls = Math.ceil(limit / 25) + 6;

    for (let i = 0; i < maxScrolls && collectedAds.length < limit; i++) {
      await page.evaluate(() => {
        if (document.body) {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      }).catch(() => {});
      await randomDelay(2500, 4000);

      // Drain any GraphQL POST responses collected since last scroll
      const batch = flushPending(pendingJsons, jobId, seen);
      if (batch.length > 0) {
        collectedAds.push(...batch);
        yield batch;
        noNewCount = 0;
      } else {
        noNewCount++;
        if (noNewCount >= 4) break;
      }
    }

    // Final drain
    const last = flushPending(pendingJsons, jobId, seen);
    if (last.length > 0) {
      collectedAds.push(...last);
      yield last;
    }

    console.log('[scraper] done, total:', collectedAds.length);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function flushPending(
  pending: unknown[],
  jobId: string | undefined,
  seen: Set<string>
): Ad[] {
  const ads: Ad[] = [];
  while (pending.length > 0) {
    const json = pending.shift();
    for (const ad of parseGraphQLResponse(json, jobId)) {
      if (!seen.has(ad.id)) {
        seen.add(ad.id);
        ads.push(ad);
      }
    }
  }
  return ads;
}

export async function scrapeAdvertiser(
  advertiserName: string,
  jobId?: string
): Promise<Ad[]> {
  const ads: Ad[] = [];
  for await (const batch of scrapeAds(
    { advertiser: advertiserName, status: 'ALL', limit: 200 },
    jobId
  )) {
    ads.push(...batch);
  }
  return ads;
}
