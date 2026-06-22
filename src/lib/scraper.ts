import type { Page } from 'playwright';
import { launchBrowser, createContext, randomDelay } from './browser';
import { parseGraphQLResponse, parseAdDetails } from './parser';
import type { Ad, SearchParams } from '@/types/ads';

// Captured "See ad details" (AdLibraryV3AdDetailsQuery) request, used to replay
// the details query for every ad without re-rendering the page per ad.
interface DetailSignature {
  url: string;
  form: Record<string, string>;   // parsed urlencoded body of the captured request
  variablesKey: string;           // form key holding the JSON variables
  lsd: string;                    // x-fb-lsd token (also present in form)
}

// Matches Meta's ad-details GraphQL query (e.g. AdLibraryV3AdDetailsQuery —
// the version prefix changes over time, so match the stable "AdDetails" part).
const DETAIL_QUERY_RE = /AdDetails/i;
const DETAIL_CONCURRENCY = 5;

const ADS_LIBRARY_BASE = 'https://www.facebook.com/ads/library/';

function buildUrl(params: SearchParams): string {
  const statusMap: Record<string, string> = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ALL: 'all',
  };

  // Page-view mode: full advertiser library sorted by total impressions
  if (params.page_id) {
    const url = new URL(ADS_LIBRARY_BASE);
    url.searchParams.set('active_status', statusMap[params.status ?? 'ALL'] ?? 'all');
    url.searchParams.set('ad_type', 'all');
    url.searchParams.set('country', params.country || 'ALL');
    url.searchParams.set('search_type', 'page');
    url.searchParams.set('view_all_page_id', params.page_id);
    url.searchParams.set('sort_data[mode]', 'total_impressions');
    url.searchParams.set('sort_data[direction]', 'desc');
    return url.toString();
  }

  const url = new URL(ADS_LIBRARY_BASE);
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

/**
 * Triggers the "See ad details" panel on the first ad so Meta fires the
 * AdLibraryAdDetailsV2Query, then captures that request's signature (doc_id,
 * tokens, variable shape) for replay. Returns null if it can't be captured —
 * callers must degrade gracefully (base ads only).
 */
async function captureDetailSignature(page: Page): Promise<DetailSignature | null> {
  let captured: DetailSignature | null = null;

  const onReq = (req: import('playwright').Request) => {
    try {
      if (req.method() !== 'POST') return;
      const url = req.url();
      if (!url.includes('/api/graphql')) return;
      const post = req.postData() || '';
      if (!DETAIL_QUERY_RE.test(post)) return;
      const form: Record<string, string> = {};
      new URLSearchParams(post).forEach((v, k) => { form[k] = v; });
      // The variables key holds JSON referencing the ad archive id
      const variablesKey = Object.keys(form).find((k) => {
        const val = form[k];
        return val.trim().startsWith('{') && /archive/i.test(val);
      });
      if (!variablesKey) return;
      captured = { url, form, variablesKey, lsd: form.lsd || '' };
    } catch { /* ignore */ }
  };

  page.on('request', onReq);
  try {
    // Click the first "See ad details" / "See summary details" control
    const selectors = [
      'div[role="button"]:has-text("See ad details")',
      'div[role="button"]:has-text("See summary details")',
      'a:has-text("See ad details")',
      'span:has-text("See ad details")',
    ];
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click({ timeout: 3000 }).catch(() => {});
        break;
      }
    }
    // Wait briefly for the details request to fire
    for (let i = 0; i < 12 && !captured; i++) await randomDelay(250, 400);
    await page.keyboard.press('Escape').catch(() => {});
  } finally {
    page.off('request', onReq);
  }
  return captured;
}

/** Builds the urlencoded body for one ad by swapping the archive/page ids. */
function buildDetailBody(sig: DetailSignature, ad: Ad): string {
  let vars: Record<string, unknown>;
  try { vars = JSON.parse(sig.form[sig.variablesKey]); } catch { return ''; }
  for (const k of Object.keys(vars)) {
    if (/archive/i.test(k)) vars[k] = ad.id;
    else if (/pageid|page_id/i.test(k) && ad.advertiser_page_id) vars[k] = ad.advertiser_page_id;
  }
  const form = { ...sig.form, [sig.variablesKey]: JSON.stringify(vars) };
  return new URLSearchParams(form).toString();
}

function parseMaybePrefixed(text: string): unknown {
  if (!text) return null;
  const cleaned = text.replace(/^for \(;;\);/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* try line-delimited */ }
  for (const line of cleaned.split('\n')) {
    const t = line.trim();
    if (t[0] === '{') { try { return JSON.parse(t); } catch { /* skip */ } }
  }
  return null;
}

/**
 * Enriches a batch of ads with "See ad details" data. The details query must be
 * replayed from inside the page (real browser headers/cookies) — replaying via
 * a Node request context gets rejected by Meta. Runs the fetches in-page with
 * bounded concurrency. Mutates ads in place.
 */
async function enrichBatch(page: Page, sig: DetailSignature, batch: Ad[]): Promise<void> {
  const jobs = batch
    .map((ad) => ({ id: ad.id, body: buildDetailBody(sig, ad) }))
    .filter((j) => j.body);
  if (jobs.length === 0) return;

  // Run all replays inside the page event loop with a concurrency cap
  const results = await page.evaluate(
    async ({ jobs, url, lsd, concurrency }) => {
      const out: Array<{ id: string; text: string }> = [];
      const queue = [...jobs];
      async function worker() {
        while (queue.length) {
          const job = queue.shift();
          if (!job) break;
          try {
            const r = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-lsd': lsd },
              body: job.body,
              credentials: 'include',
            });
            out.push({ id: job.id, text: await r.text() });
          } catch {
            out.push({ id: job.id, text: '' });
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
      return out;
    },
    { jobs, url: sig.url, lsd: sig.lsd, concurrency: DETAIL_CONCURRENCY }
  );

  const byId = new Map(batch.map((a) => [a.id, a]));
  for (const res of results) {
    const ad = byId.get(res.id);
    if (!ad) continue;
    const json = parseMaybePrefixed(res.text);
    if (!json) continue;
    const detail = parseAdDetails(json);
    if (detail.detail_fetched) {
      Object.assign(ad, detail);
      ad.deep_search_done = true;
    }
  }
}

export async function* scrapeAds(
  params: SearchParams,
  jobId?: string,
  externalSeen?: Set<string>
): AsyncGenerator<Ad[], void, unknown> {
  if (!params.keyword && !params.advertiser && !params.page_id) return;

  const limit = params.limit || 100;
  const seen = externalSeen ?? new Set<string>();
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

    // Deep "See ad details" enrichment: capture the details query once, then
    // replay it per ad. Degrades gracefully if the signature can't be captured.
    let detailSig: DetailSignature | null = null;
    if (params.fetch_details) {
      detailSig = await captureDetailSignature(page);
      console.log('[scraper] detail signature captured:', !!detailSig);
    }
    async function out(batch: Ad[]): Promise<Ad[]> {
      if (detailSig && batch.length) {
        await enrichBatch(page, detailSig, batch).catch(() => {});
      }
      return batch;
    }

    // Extract initial batch from raw SSR HTML (captured in response handler above)
    const initialBatch = rawHtml ? extractFromHtml(rawHtml, jobId, seen) : [];
    console.log('[scraper] initial HTML batch:', initialBatch.length, 'ads (rawHtml captured:', !!rawHtml, ')');

    if (initialBatch.length > 0) {
      collectedAds.push(...initialBatch);
      yield await out(initialBatch);
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
        yield await out(batch);
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
      yield await out(last);
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

/**
 * Deep search: pass 1 finds the advertiser page ID, pass 2 scrapes the full
 * page library sorted by total impressions. Both passes share a dedup Set so
 * cross-pass duplicates are removed automatically.
 */
export async function scrapeAdvertiserDeep(
  advertiserName: string,
  jobId?: string
): Promise<Ad[]> {
  const seen = new Set<string>();
  const ads: Ad[] = [];
  let pageId: string | undefined;

  for await (const batch of scrapeAds(
    { advertiser: advertiserName, status: 'ALL', limit: 50 },
    jobId,
    seen
  )) {
    ads.push(...batch);
    if (!pageId) pageId = batch.find((a) => a.advertiser_page_id)?.advertiser_page_id;
  }

  if (pageId) {
    for await (const batch of scrapeAds(
      { page_id: pageId, status: 'ALL', limit: 200 },
      jobId,
      seen
    )) {
      ads.push(...batch);
    }
  }

  return ads;
}
