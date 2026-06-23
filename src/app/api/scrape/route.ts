import { NextRequest } from 'next/server';
import { scrapeAds } from '@/lib/scraper';
import { upsertAd, createScrapeJob, completeScrapeJob, errorScrapeJob, getPreviousJobAds, getSearchSession, touchSearchSession } from '@/lib/db';
import { signalStatus } from '@/lib/metaHealth';
import { totalBlockCount } from '@/lib/rateLimiter';
import { deliverWebhook, buildAdvertiserCompany } from '@/lib/webhook';
import type { SearchParams, Ad } from '@/types/ads';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const params: SearchParams = await req.json();
  const jobId = createScrapeJob(params);
  const previousIds = params.advertiser ? getPreviousJobAds(params.advertiser, jobId) : new Set<string>();

  // Optional live (playing) search session — stamp scraped ads with it, and (when
  // it has a webhook URL and fires on scrape) push each ad in real time. The client
  // only sends session_id for the live session, so paused sessions never reach here.
  const session = params.session_id ? getSearchSession(params.session_id) : null;
  const fireOnScrape = !!session?.webhook_url && (session.fire_on === 'scrape' || session.fire_on === 'both');

  const encoder = new TextEncoder();
  let total = 0;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const blocksAtStart = totalBlockCount();
      try {
        send({ type: 'job_id', job_id: jobId });

        const gen = scrapeAds(params, jobId);
        for await (const batch of gen) {
          // Client hit stop / navigated away — break so the generator's finally
          // closes the browser instead of scraping on in the background.
          if (req.signal.aborted) break;
          for (const ad of batch) {
            const enriched: Ad = { ...ad, is_new: !previousIds.has(ad.id), session_id: session?.id };
            upsertAd(enriched);
            total++;
            if (fireOnScrape) {
              // Same { job_id, company, ads } shape as a bulk company_done fire.
              deliverWebhook(
                { url: session!.webhook_url, secret: session!.webhook_secret, enabled: true },
                'search.ad_scraped', 'search',
                {
                  job_id: session!.id,
                  session_id: session!.id,
                  session_name: session!.name,
                  company: buildAdvertiserCompany(enriched, session!.id),
                  ads: [enriched],
                }
              );
            }
            send({ type: 'ad', data: enriched });
          }
          send({ type: 'progress', count: total });
        }

        // Only warn on SUSTAINED throttling. A single transient 429 is normal
        // and the backoff absorbs it without losing results — warning on that
        // was over-alarming (every brand-page scrape would cry wolf).
        if (totalBlockCount() - blocksAtStart >= 2) {
          send({
            type: 'warning',
            code: 'META_RATE_LIMITED',
            message:
              'Meta rate-limited this run — the scraper automatically slowed down and backed off. Results may be partial; wait a few minutes and re-run if counts look low.',
          });
        }

        // If we asked for ad details but couldn't capture Meta's details query,
        // tell the user why their EU/demographic data is missing — loudly,
        // rather than letting them assume the ads just had no details.
        if (params.fetch_details && signalStatus('ad_details') === 'down') {
          send({
            type: 'warning',
            code: 'META_DETAILS_UNAVAILABLE',
            message:
              'Meta appears to have changed their "See ad details" API — ads were scraped, but EU transparency and demographic data could not be fetched this run.',
          });
        }

        if (session && total > 0) touchSearchSession(session.id);
        completeScrapeJob(jobId, total);
        send({ type: 'done', total, job_id: jobId });
      } catch (err) {
        errorScrapeJob(jobId);
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
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
