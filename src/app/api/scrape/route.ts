import { NextRequest } from 'next/server';
import { scrapeAds } from '@/lib/scraper';
import { upsertAd, createScrapeJob, completeScrapeJob, errorScrapeJob, getPreviousJobAds } from '@/lib/db';
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
