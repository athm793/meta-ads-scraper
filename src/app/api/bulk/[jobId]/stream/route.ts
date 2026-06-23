import { NextRequest } from 'next/server';
import {
  getBulkJob, getBulkJobCompanies, updateBulkCompany,
  incrementBulkJobProgress, completeBulkJob, updateBulkJobStatus, upsertAd,
  getBulkJobStatus, resetStuckBulkCompanies,
} from '@/lib/db';
import { scrapeAds, searchAdvertisers } from '@/lib/scraper';
import { randomDelay } from '@/lib/browser';
import { throttledSince } from '@/lib/rateLimiter';
import { deliverWebhook } from '@/lib/webhook';
import type { WebhookConfig } from '@/types/ads';
import { resolveSiteHandles, normHandle, type SiteHandles } from '@/lib/socialHandles';
import type { Ad, BulkCompany, BulkMatchMethod, MediaType, Platform, SearchParams, AdvertiserSuggestion } from '@/types/ads';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

// Deterministic match: find the typeahead suggestion whose Facebook handle
// (page_alias) or Instagram handle EXACTLY equals a handle found on the brand's
// website. No name guessing — an identity match or nothing. FB is preferred.
function pickHandleMatch(
  matches: AdvertiserSuggestion[],
  site: SiteHandles
): { page: AdvertiserSuggestion; via: 'fb' | 'ig' } | null {
  const fb = normHandle(site.facebook);
  const ig = normHandle(site.instagram);
  if (fb) {
    const hit = matches.find((m) => m.page_alias && normHandle(m.page_alias) === fb);
    if (hit) return { page: hit, via: 'fb' };
  }
  if (ig) {
    const hit = matches.find((m) => m.ig_username && normHandle(m.ig_username) === ig);
    if (hit) return { page: hit, via: 'ig' };
  }
  return null;
}

// Conservative default — 20 parallel headless browsers from one IP is the
// fastest way to get rate-limited. The global limiter paces requests on top.
const DEFAULT_WORKERS = 4;
const MAX_WORKERS = 10;
const clampWorkers = (n: unknown) => Math.min(MAX_WORKERS, Math.max(1, Math.round(Number(n)) || DEFAULT_WORKERS));

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getBulkJob(jobId);
  if (!job) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      }

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { clearInterval(heartbeat); }
      }, 15000);

      const startedAt = Date.now();
      try {
        // A fresh stream means nothing is actually mid-scrape — re-queue any
        // company left as 'scraping' by a previous (paused/disconnected) run.
        resetStuckBulkCompanies(jobId);
        updateBulkJobStatus(jobId, 'running');
        const allCompanies = getBulkJobCompanies(jobId);
        const pending = allCompanies.filter((c) => c.status === 'pending' || c.status === 'error');

        // Shared dedup set — ads seen by any worker are skipped by all others
        const globalSeen = new Set<string>();
        let totalDeduped = 0;

        // Per-job outbound webhook (optional). Fired once per completed company
        // with that company's summary + its ads — fire-and-forget, never blocks.
        const jobWebhook: WebhookConfig = {
          url: job!.webhook_url,
          secret: job!.webhook_secret,
          enabled: job!.webhook_enabled,
        };

        async function processCompany(company: BulkCompany): Promise<void> {
          if (req.signal.aborted) return;

          send({ type: 'company_start', company_name: company.company_name, company_id: company.id });
          updateBulkCompany(company.id, { status: 'scraping' });

          try {
            const localAds: Ad[] = [];
            const f = job!.filters ?? {};

            const scrapeParams: SearchParams = {
              status: f.status ?? 'ALL',
              ad_type: f.media_types && f.media_types.length === 1 ? f.media_types[0] : undefined,
              limit: 200,
              fetch_details: f.fetch_details,
            };

            // --- Resolve which Meta page (or keyword) to scrape ---
            let matchMethod: BulkMatchMethod | null = null;

            if (company.matched_page_id) {
              // Advanced override: an exact page URL/ID was supplied on upload.
              scrapeParams.page_id = company.matched_page_id;
              matchMethod = 'page_id';
            } else if (f.match_pages) {
              // Deterministic brand-page mode: read the brand's FB/IG handle off
              // its website and match it EXACTLY against the typeahead's
              // page_alias / ig_username. An identity match or nothing — no name
              // guessing. Resolve the site + typeahead concurrently so the site
              // fetch hides behind the (rate-limited) typeahead call.
              const lookupCountry = f.country && f.country !== 'ALL' ? f.country : 'US';
              const [siteRes, firstRes] = await Promise.allSettled([
                resolveSiteHandles(company.website || ''),
                searchAdvertisers(company.company_name, lookupCountry),
              ]);
              const site: SiteHandles = siteRes.status === 'fulfilled' ? siteRes.value : { fetched: false, via: null };
              let suggestions: AdvertiserSuggestion[] = firstRes.status === 'fulfilled' ? firstRes.value : [];

              let hit = (site.facebook || site.instagram) ? pickHandleMatch(suggestions, site) : null;
              // The brand's site may differ from its Meta page name — try a
              // second typeahead keyed on the handle itself before giving up.
              if (!hit && (site.facebook || site.instagram)) {
                try {
                  suggestions = await searchAdvertisers((site.facebook || site.instagram)!, lookupCountry);
                  hit = pickHandleMatch(suggestions, site);
                } catch { /* ignore */ }
              }

              if (hit) {
                scrapeParams.page_id = hit.page.page_id;
                matchMethod = hit.via === 'fb' ? 'handle_fb' : 'handle_ig';
                updateBulkCompany(company.id, {
                  matched_name: hit.page.name,
                  matched_page_id: hit.page.page_id,
                  match_method: matchMethod,
                  fb_handle: site.facebook,
                  ig_handle: site.instagram,
                });
              } else {
                // Couldn't verify deterministically — flag for review, don't guess.
                updateBulkCompany(company.id, {
                  status: 'unverified',
                  fb_handle: site.facebook,
                  ig_handle: site.instagram,
                  scraped_at: new Date().toISOString(),
                });
                incrementBulkJobProgress(jobId);
                send({
                  type: 'company_done',
                  company_name: company.company_name,
                  company_id: company.id,
                  result: { ...company, status: 'unverified', fb_handle: site.facebook, ig_handle: site.instagram },
                  dedup_count: totalDeduped,
                });
                return;
              }
            } else {
              // Keyword mode: explicit keyword search, no handle resolution.
              scrapeParams.advertiser = company.company_name;
              matchMethod = 'keyword';
            }

            for await (const batch of scrapeAds(scrapeParams, company.id)) {
              // Breaking on abort runs the generator's finally → closes the
              // browser promptly instead of waiting out the whole company.
              if (req.signal.aborted) break;
              localAds.push(...batch);
            }

            // Apply media-type / platform scope filters that Meta's URL can't express
            const scoped = localAds.filter((a) => {
              if (f.media_types && f.media_types.length > 0 && !f.media_types.includes(a.media_type)) return false;
              if (f.platforms && f.platforms.length > 0 && !a.platforms.some((p) => f.platforms!.includes(p))) return false;
              return true;
            });
            localAds.length = 0;
            localAds.push(...scoped);

            // Dedup against global seen — JS is single-threaded so no race condition
            const uniqueAds: Ad[] = [];
            for (const ad of localAds) {
              if (!globalSeen.has(ad.id)) {
                globalSeen.add(ad.id);
                uniqueAds.push(ad);
              } else {
                totalDeduped++;
              }
            }

            const activeAds = uniqueAds.filter((a) => a.status === 'ACTIVE');
            const inactiveAds = uniqueAds.filter((a) => a.status === 'INACTIVE');
            const adTypes = [...new Set(uniqueAds.map((a) => a.media_type))] as MediaType[];
            const platforms = [...new Set(uniqueAds.flatMap((a) => a.platforms))] as Platform[];

            let spendRange: string | undefined;
            const adsWithSpend = uniqueAds.filter((a) => a.spend_min != null && a.spend_max != null);
            if (adsWithSpend.length > 0) {
              const minSpend = Math.min(...adsWithSpend.map((a) => a.spend_min!));
              const maxSpend = Math.max(...adsWithSpend.map((a) => a.spend_max!));
              const currency = adsWithSpend[0].spend_currency || '$';
              spendRange = `${currency}${minSpend.toLocaleString()}–${currency}${maxSpend.toLocaleString()}`;
            }

            const lastAdDate = uniqueAds
              .map((a) => a.started_at)
              .filter(Boolean)
              .sort()
              .reverse()[0];

            for (const ad of uniqueAds) {
              upsertAd({ ...ad, scrape_job_id: company.id });
            }

            const updatedCompany = {
              status: uniqueAds.length === 0 ? ('not_found' as const) : ('done' as const),
              active_ads_count: activeAds.length,
              inactive_ads_count: inactiveAds.length,
              ad_types: adTypes,
              platforms,
              spend_range: spendRange,
              last_ad_date: lastAdDate,
              match_method: matchMethod,
              scraped_at: new Date().toISOString(),
            };

            updateBulkCompany(company.id, updatedCompany);
            incrementBulkJobProgress(jobId);

            // Real-time push: this company's summary + its ads. Fire-and-forget.
            deliverWebhook(jobWebhook, 'bulk.company_done', 'bulk', {
              job_id: jobId,
              company: { ...company, ...updatedCompany },
              ads: uniqueAds,
            });

            send({
              type: 'company_done',
              company_name: company.company_name,
              company_id: company.id,
              result: { ...company, ...updatedCompany },
              dedup_count: totalDeduped,
            });
          } catch {
            updateBulkCompany(company.id, { status: 'error', scraped_at: new Date().toISOString() });
            incrementBulkJobProgress(jobId);
            send({
              type: 'company_done',
              company_name: company.company_name,
              company_id: company.id,
              result: { ...company, status: 'error' },
              dedup_count: totalDeduped,
            });
          }
        }

        // Worker-queue concurrency: N workers each drain from the same queue.
        // Before pulling the next company, each worker checks the job's current
        // status — if it was flipped to paused/cancelled via the control
        // endpoint, workers stop queuing new companies (in-flight ones finish).
        const concurrency = clampWorkers(job.filters?.workers);
        const queue = [...pending];
        await Promise.all(
          Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
            while (true) {
              const status = getBulkJobStatus(jobId);
              if (status === 'paused' || status === 'cancelled') break;
              const company = queue.shift();
              if (!company) break;
              await processCompany(company);
              // Jittered gap between companies so each worker isn't a steady
              // drumbeat against Meta (on top of the global rate limiter).
              if (queue.length > 0) await randomDelay(800, 2500);
            }
          })
        );

        const finalStatus = getBulkJobStatus(jobId);
        if (finalStatus === 'cancelled') {
          send({ type: 'cancelled', dedup_count: totalDeduped });
        } else if (finalStatus === 'paused') {
          send({ type: 'paused', dedup_count: totalDeduped });
        } else if (req.signal.aborted) {
          // Client disconnected without an explicit control action — leave the
          // job runnable so reopening the stream resumes it.
        } else {
          if (throttledSince(startedAt)) {
            send({
              type: 'warning',
              code: 'META_RATE_LIMITED',
              message:
                'Meta rate-limited this job — workers automatically slowed down and backed off. Some companies may show low counts; re-run them in a few minutes, or lower the worker count.',
            });
          }
          completeBulkJob(jobId);
          send({ type: 'done', total: pending.length, dedup_count: totalDeduped });
        }
      } catch (err) {
        updateBulkJobStatus(jobId, 'error');
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
