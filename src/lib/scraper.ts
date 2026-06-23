import type { Page, BrowserContext } from 'playwright';
import { launchBrowser, createContext, closeBrowser, randomDelay } from './browser';
import { parseGraphQLResponse, parseAdDetails } from './parser';
import { recordOk, recordDown, MetaSignatureError } from './metaHealth';
import { acquire, reportBlocked, reportOk, isBlockStatus, looksBlocked } from './rateLimiter';
import { nextProxy } from './proxies';
import type { Ad, SearchParams, AdvertiserSuggestion } from '@/types/ads';

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
// In-page detail fetches per batch. Kept low so a single page doesn't burst
// Meta; the global rate limiter paces the batches themselves.
const DETAIL_CONCURRENCY = 3;

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
async function captureDetailSignature(page: Page): Promise<{ sig: DetailSignature | null; sawButton: boolean }> {
  let captured: DetailSignature | null = null;
  let sawButton = false;

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
        sawButton = true;
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
  return { sig: captured, sawButton };
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

  // One token per batch — paces detail enrichment against everything else.
  await acquire();

  // Run all replays inside the page event loop with a concurrency cap
  const results = await page.evaluate(
    async ({ jobs, url, lsd, concurrency }) => {
      const out: Array<{ id: string; status: number; text: string }> = [];
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
            out.push({ id: job.id, status: r.status, text: await r.text() });
          } catch {
            out.push({ id: job.id, status: 0, text: '' });
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
      return out;
    },
    { jobs, url: sig.url, lsd: sig.lsd, concurrency: DETAIL_CONCURRENCY }
  );

  let blocked = false;
  let anyOk = false;
  const byId = new Map(batch.map((a) => [a.id, a]));
  for (const res of results) {
    if (isBlockStatus(res.status) || looksBlocked(res.text)) blocked = true;
    else if (res.status === 200) anyOk = true;
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
  // Adapt: back off if Meta pushed back, relax if it's serving cleanly.
  if (blocked) reportBlocked();
  else if (anyOk) reportOk();
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

  // Browser is created INSIDE the try so any failure during context/page
  // creation (common under heavy concurrency) still hits the finally and gets
  // closed — otherwise the launched browser would leak with no ref to close it.
  let browser: import('playwright').Browser | undefined;
  let rawHtml = '';

  try {
    const b = await launchBrowser(true);
    browser = b;
    const context = await createContext(b, nextProxy());
    const page = await context.newPage();

  // Intercept ALL responses:
  // 1. The main page HTML (SSR data) — captured as raw text before React hydrates it
  // 2. GraphQL POSTs (pagination on scroll)
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const status = response.status();

      // Block detection — Meta pushing back on Ad Library / GraphQL traffic.
      if ((url.includes('ads/library') || url.includes('/api/graphql')) && isBlockStatus(status)) {
        reportBlocked();
        return;
      }
      if (status !== 200) return;

      const method = response.request().method();

      // Capture the raw main page HTML response (SSR ad data is embedded here)
      if (method === 'GET' && url.includes('ads/library') && !rawHtml) {
        const text = await response.text().catch(() => '');
        if (text.includes('ad_archive_id')) {
          rawHtml = text;
          reportOk();
        }
        return;
      }

      // Capture scroll-triggered GraphQL POST responses (pagination)
      if (method === 'POST' && url.includes('/api/graphql')) {
        const text = await response.text().catch(() => '');
        if (looksBlocked(text)) { reportBlocked(); return; }
        if (!text.includes('ad_archive_id')) return;
        reportOk();
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (t[0] !== '{') continue;
          try { pendingJsons.push(JSON.parse(t)); } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
  });

    const targetUrl = buildUrl(params);
    console.log('[scraper] navigating to:', targetUrl);

    await acquire();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 4500);
    await handleCookieConsent(page);
    await randomDelay(1000, 2000);

    // Deep "See ad details" enrichment: capture the details query once, then
    // replay it per ad. Degrades gracefully if the signature can't be captured.
    let detailSig: DetailSignature | null = null;
    if (params.fetch_details) {
      const cap = await captureDetailSignature(page);
      detailSig = cap.sig;
      console.log('[scraper] detail signature captured:', !!detailSig, '(saw button:', cap.sawButton, ')');
      if (cap.sig) {
        recordOk('ad_details');
      } else if (cap.sawButton) {
        // The "See ad details" control was on the page but its GraphQL request
        // never matched our query name — strong signal Meta renamed the query.
        recordDown(
          'ad_details',
          'Found a "See ad details" control but could not capture its GraphQL request (expected AdLibraryV3AdDetailsQuery). Meta likely renamed the query — EU transparency / demographic data will be unavailable until the matcher is updated.'
        );
      }
      // No button at all is normal (non-EU/non-political ads have no details) —
      // leave the signal untouched rather than raise a false alarm.
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
      await acquire();
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
    // Any ads parsed means the ad_archive_id payload shape still works. We don't
    // mark search "down" on zero results — an empty page is also a valid "no
    // matches", which we can't reliably tell apart from a structure change here.
    if (collectedAds.length > 0) recordOk('search');
  } finally {
    // Closing the browser tears down its context and page too. closeBrowser
    // also deregisters it from the live-browser set used at shutdown.
    await closeBrowser(browser);
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

// ---------------------------------------------------------------------------
// Advertiser typeahead — Meta's search-box suggestions of advertiser PAGES.
//
// A single headless browser is kept warm on the Ad Library page; once we've
// captured the typeahead request's signature (doc_id + tokens), every search
// is just an in-page GraphQL replay swapping the query string — fast, no new
// browser per keystroke. The context self-heals if it goes stale/closed.
// ---------------------------------------------------------------------------

interface TypeaheadCtx {
  browser: import('playwright').Browser;
  context: BrowserContext;
  page: Page;
  form: Record<string, string>;
  expires: number;
}

let typeaheadCtx: TypeaheadCtx | null = null;
let typeaheadInit: Promise<TypeaheadCtx> | null = null;
let typeaheadIdle: ReturnType<typeof setTimeout> | null = null;

async function teardownTypeahead() {
  if (typeaheadIdle) { clearTimeout(typeaheadIdle); typeaheadIdle = null; }
  const ctx = typeaheadCtx;
  typeaheadCtx = null;
  if (!ctx) return;
  await ctx.page.close().catch(() => {});
  await ctx.context.close().catch(() => {});
  await ctx.browser.close().catch(() => {});
}

// Close the warm browser after a few minutes of no searches so it never lingers
function bumpTypeaheadIdle() {
  if (typeaheadIdle) clearTimeout(typeaheadIdle);
  typeaheadIdle = setTimeout(() => { void teardownTypeahead(); }, 3 * 60 * 1000);
}

async function buildTypeaheadCtx(): Promise<TypeaheadCtx> {
  const browser = await launchBrowser(true);
  const context = await createContext(browser, nextProxy());
  const page = await context.newPage();

  let form: Record<string, string> | null = null;
  page.on('request', (req) => {
    if (form || req.method() !== 'POST' || !req.url().includes('/api/graphql')) return;
    const post = req.postData() || '';
    if (!/useAdLibraryTypeaheadSuggestion/i.test(post)) return;
    const f: Record<string, string> = {};
    new URLSearchParams(post).forEach((v, k) => { f[k] = v; });
    if (f.variables && /queryString/.test(f.variables)) form = f;
  });

  try {
    await acquire();
    await page.goto(
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=ad&search_type=keyword_unordered',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await randomDelay(3000, 4500);
    await handleCookieConsent(page);
    await randomDelay(800, 1500);

    const box = page.locator('input[type="search"], input[placeholder*="eyword"], input[placeholder*="dvertiser"]').first();
    await box.click({ timeout: 6000 }).catch(() => {});
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.keyboard.type('nike', { delay: 140 }).catch(() => {});

    for (let i = 0; i < 25 && !form; i++) await randomDelay(150, 250);
    if (!form) {
      throw new MetaSignatureError(
        'typeahead',
        'Could not capture Meta\'s advertiser typeahead query (expected useAdLibraryTypeaheadSuggestionDataSourceQuery). Meta likely renamed it — advertiser autocomplete is unavailable until the matcher is updated.'
      );
    }

    const ctx: TypeaheadCtx = { browser, context, page, form, expires: Date.now() + 10 * 60 * 1000 };
    typeaheadCtx = ctx;
    return ctx;
  } catch (err) {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }
}

async function getTypeaheadCtx(): Promise<TypeaheadCtx> {
  if (typeaheadCtx && Date.now() < typeaheadCtx.expires && !typeaheadCtx.page.isClosed()) {
    return typeaheadCtx;
  }
  await teardownTypeahead();
  if (!typeaheadInit) {
    typeaheadInit = buildTypeaheadCtx().finally(() => { typeaheadInit = null; });
  }
  return typeaheadInit;
}

/** Returns advertiser pages matching a query, via Meta's search typeahead. */
export async function searchAdvertisers(query: string, country = 'US'): Promise<AdvertiserSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  async function run(ctx: TypeaheadCtx): Promise<AdvertiserSuggestion[]> {
    const form = { ...ctx.form };
    let vars: Record<string, unknown>;
    try { vars = JSON.parse(form.variables); } catch { return []; }
    vars.queryString = q;
    vars.country = country;
    form.variables = JSON.stringify(vars);
    const body = new URLSearchParams(form).toString();

    await acquire();
    const { status, text } = await ctx.page.evaluate(
      async ({ body, lsd }) => {
        const r = await fetch('/api/graphql/', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-lsd': lsd },
          body,
          credentials: 'include',
        });
        return { status: r.status, text: await r.text() };
      },
      { body, lsd: form.lsd || '' }
    );

    if (isBlockStatus(status) || looksBlocked(text)) { reportBlocked(); return []; }
    reportOk();

    const json = parseMaybePrefixed(text) as Record<string, unknown> | null;
    type PR = {
      page_id: string | number; name: string; category?: string; image_uri?: string;
      likes?: number; ig_followers?: number; verification?: string; ig_verification?: boolean;
      page_alias?: string; page_is_deleted?: boolean;
    };
    const pages = (firstByPath(json, ['data', 'ad_library_main', 'typeahead_suggestions', 'page_results']) as PR[] | undefined) || [];
    return pages
      .filter((p) => p && !p.page_is_deleted)
      .map((p) => ({
        page_id: String(p.page_id),
        name: p.name,
        category: p.category,
        image_uri: p.image_uri,
        likes: typeof p.likes === 'number' ? p.likes : undefined,
        ig_followers: typeof p.ig_followers === 'number' ? p.ig_followers : undefined,
        verified: p.verification === 'BLUE_VERIFIED' || p.ig_verification === true,
        page_alias: p.page_alias,
      }));
  }

  try {
    const r = await run(await getTypeaheadCtx());
    recordOk('typeahead');
    bumpTypeaheadIdle();
    return r;
  } catch {
    // One retry with a fresh context (handles a stale/closed page)
    await teardownTypeahead();
    try {
      const r = await run(await getTypeaheadCtx());
      recordOk('typeahead');
      bumpTypeaheadIdle();
      return r;
    } catch (err2) {
      // A signature error is a real "Meta changed their API" event — record it
      // and surface it to the caller so the UI can flag it loudly. Other errors
      // (transient network/browser issues) degrade quietly to no suggestions.
      if (err2 instanceof MetaSignatureError) {
        recordDown('typeahead', err2.message);
        throw err2;
      }
      return [];
    }
  }
}

function firstByPath(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
