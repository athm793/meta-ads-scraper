import { NextRequest } from 'next/server';
import { scrapeAds } from '@/lib/scraper';
import { upsertAd, createScrapeJob, completeScrapeJob, errorScrapeJob, getPreviousJobAds } from '@/lib/db';
import { signalStatus } from '@/lib/metaHealth';
import { throttledSince } from '@/lib/rateLimiter';
import type { SearchParams, Ad } from '@/types/ads';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const params: SearchParams = await req.json();
  const jobId = createScrapeJob(params);
  const previousIds = params.advertiser ? getPreviousJobAds(params.advertiser, jobId) : new Set<string>();

  const encoder = new TextEncoder();
  let total = 0;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const startedAt = Date.now();
      try {
        send({ type: 'job_id', job_id: jobId });

        const gen = scrapeAds(params, jobId);
        for await (const batch of gen) {
          for (const ad of batch) {
            const enriched: Ad = { ...ad, is_new: !previousIds.has(ad.id) };
            upsertAd(enriched);
            total++;
            send({ type: 'ad', data: enriched });
          }
          send({ type: 'progress', count: total });
        }

        // Meta pushed back during this run — the limiter already backed off,
        // but tell the user their results may be partial.
        if (throttledSince(startedAt)) {
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
