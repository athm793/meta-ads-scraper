import crypto from 'crypto';
import type { WebhookConfig, Ad } from '@/types/ads';

const TIMEOUT_MS = 5000;
const TEST_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3; // initial try + 2 retries

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Standard envelope: { event, sent_at, source, ...data }.
function buildBody(event: string, source: 'bulk' | 'search', data: object): string {
  return JSON.stringify({ event, sent_at: new Date().toISOString(), source, ...data });
}

function buildHeaders(event: string, body: string, secret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
  };
  if (secret) headers['X-Webhook-Signature'] = sign(body, secret);
  return headers;
}

/**
 * Synthesize a bulk-style `company` object from a single search ad's advertiser,
 * so search-session fires carry the SAME `{ job_id, company, ads }` body as a
 * bulk `company_done` fire. A downstream system then integrates one schema for
 * both. (Search has no separate company entity, so the advertiser stands in.)
 */
export function buildAdvertiserCompany(ad: Ad, sessionId: string) {
  const active = ad.status === 'ACTIVE';
  let spend_range: string | null = null;
  if (ad.spend_min != null && ad.spend_max != null) {
    const c = ad.spend_currency || '$';
    spend_range = `${c}${ad.spend_min.toLocaleString()}–${c}${ad.spend_max.toLocaleString()}`;
  }
  // Emits the FULL BulkCompany key set (nulls where search has no equivalent,
  // e.g. handle resolution) so the object is a strict superset of a bulk
  // company — one schema, every key present in both.
  return {
    id: ad.advertiser_page_id || ad.advertiser_name,
    job_id: sessionId,
    company_name: ad.advertiser_name,
    website: null,
    category: null,
    matched_name: ad.advertiser_name,
    matched_page_id: ad.advertiser_page_id ?? null,
    fb_handle: null,
    ig_handle: null,
    match_method: null,
    status: 'done' as const,
    active_ads_count: active ? 1 : 0,
    inactive_ads_count: active ? 0 : 1,
    ad_types: [ad.media_type],
    platforms: ad.platforms,
    spend_range,
    last_ad_date: ad.started_at ?? null,
    scraped_at: ad.scraped_at,
  };
}

/**
 * Fire-and-forget webhook delivery. Returns immediately; the actual POST runs
 * detached so it never blocks (or breaks) a scrape/SSE stream. All failures are
 * caught and logged — they never propagate to the caller.
 *
 * The payload is wrapped in an envelope: { event, sent_at, source, ...data }.
 * When a secret is configured the raw JSON body is HMAC-SHA256 signed and sent
 * as the `X-Webhook-Signature: sha256=<hex>` header.
 */
export function deliverWebhook(
  cfg: WebhookConfig | null | undefined,
  event: string,
  source: 'bulk' | 'search',
  data: object
): void {
  if (!cfg || !cfg.enabled || !cfg.url) return;
  const { url, secret } = cfg;

  const body = buildBody(event, source, data);
  const headers = buildHeaders(event, body, secret);

  void (async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return;
        // Non-2xx: retry on 5xx / 429, give up on other 4xx (client config error)
        if (res.status < 500 && res.status !== 429) {
          console.warn(`[webhook] ${event} → ${url} responded ${res.status}; not retrying`);
          return;
        }
        console.warn(`[webhook] ${event} → ${url} responded ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      } catch (err) {
        console.warn(`[webhook] ${event} → ${url} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err instanceof Error ? err.message : String(err)}`);
      }
      if (attempt < MAX_ATTEMPTS) {
        // Jittered backoff: ~0.5s, ~1.5s
        await sleep(attempt * 500 + Math.random() * 500);
      }
    }
  })();
}

export interface WebhookTestResult {
  ok: boolean;
  status?: number;        // HTTP status, when a response was received
  error?: string;         // reason it failed to reach a 2xx
  signed: boolean;        // whether the payload was HMAC-signed
}

// A representative `webhook.test` payload so the receiver sees the real envelope
// + header shape (and a sample of the data it would get during a real run).
function testPayload(source: 'bulk' | 'search'): object {
  const sampleAd = {
    id: '0000000000',
    advertiser_name: 'Sample Advertiser',
    media_type: 'image',
    status: 'ACTIVE',
    platforms: ['FACEBOOK', 'INSTAGRAM'],
  };
  const message = 'Test fire from Meta Ads Scraper — your webhook is reachable.';
  // Both sources share the same { job_id, company, ads } body shape.
  const company = {
    id: 'sample',
    job_id: 'sample',
    company_name: 'Sample Advertiser',
    matched_name: 'Sample Advertiser',
    status: 'done',
    active_ads_count: 1,
    inactive_ads_count: 0,
    ad_types: ['image'],
    platforms: ['FACEBOOK', 'INSTAGRAM'],
  };
  return source === 'bulk'
    ? { test: true, message, job_id: 'sample', company, ads: [sampleAd] }
    : { test: true, message, job_id: 'sample', session_id: 'sample', session_name: 'Sample session', company, ads: [sampleAd] };
}

/**
 * Synchronous, awaited test fire — unlike deliverWebhook this returns the
 * outcome so the UI can confirm the URL is reachable before a real run.
 * Single attempt, slightly longer timeout, never throws.
 */
export async function testWebhook(
  cfg: WebhookConfig,
  source: 'bulk' | 'search'
): Promise<WebhookTestResult> {
  const signed = !!cfg.secret;
  if (!cfg.url) return { ok: false, error: 'No webhook URL provided', signed };

  const event = 'webhook.test';
  const body = buildBody(event, source, testPayload(source));
  const headers = buildHeaders(event, body, cfg.secret);

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    return {
      ok: res.ok,
      status: res.status,
      signed,
      error: res.ok ? undefined : `Endpoint responded ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      signed,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
