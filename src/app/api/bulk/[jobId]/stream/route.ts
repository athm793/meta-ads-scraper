import { NextRequest } from 'next/server';
import { getBulkJob, getBulkJobCompanies, updateBulkCompany, incrementBulkJobProgress, completeBulkJob, updateBulkJobStatus, upsertAd } from '@/lib/db';
import { scrapeAdvertiser } from '@/lib/scraper';
import type { Ad, MediaType, Platform } from '@/types/ads';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getBulkJob(jobId);
  if (!job) {
    return new Response('Not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        updateBulkJobStatus(jobId, 'running');
        const companies = getBulkJobCompanies(jobId);

        for (const company of companies) {
          if (req.signal.aborted) break;

          send({ type: 'company_start', company_name: company.company_name, company_id: company.id });
          updateBulkCompany(company.id, { status: 'scraping' });

          try {
            await new Promise((r) => setTimeout(r, 3000 + Math.random() * 5000));

            const ads: Ad[] = await scrapeAdvertiser(company.company_name);

            const activeAds = ads.filter((a) => a.status === 'ACTIVE');
            const inactiveAds = ads.filter((a) => a.status === 'INACTIVE');
            const adTypes = [...new Set(ads.map((a) => a.media_type))] as MediaType[];
            const platforms = [...new Set(ads.flatMap((a) => a.platforms))] as Platform[];

            let spendRange: string | undefined;
            const adsWithSpend = ads.filter((a) => a.spend_min != null && a.spend_max != null);
            if (adsWithSpend.length > 0) {
              const minSpend = Math.min(...adsWithSpend.map((a) => a.spend_min!));
              const maxSpend = Math.max(...adsWithSpend.map((a) => a.spend_max!));
              const currency = adsWithSpend[0].spend_currency || '$';
              spendRange = `${currency}${minSpend.toLocaleString()}–${currency}${maxSpend.toLocaleString()}`;
            }

            const lastAdDate = ads
              .map((a) => a.started_at)
              .filter(Boolean)
              .sort()
              .reverse()[0];

            const updatedCompany = {
              status: ads.length === 0 ? ('not_found' as const) : ('done' as const),
              active_ads_count: activeAds.length,
              inactive_ads_count: inactiveAds.length,
              ad_types: adTypes,
              platforms,
              spend_range: spendRange,
              last_ad_date: lastAdDate,
              scraped_at: new Date().toISOString(),
            };

            updateBulkCompany(company.id, updatedCompany);

            for (const ad of ads) {
              upsertAd(ad);
            }

            incrementBulkJobProgress(jobId);
            send({
              type: 'company_done',
              company_name: company.company_name,
              company_id: company.id,
              result: { ...company, ...updatedCompany },
            });
          } catch (err) {
            updateBulkCompany(company.id, { status: 'error', scraped_at: new Date().toISOString() });
            incrementBulkJobProgress(jobId);
            send({
              type: 'company_done',
              company_name: company.company_name,
              company_id: company.id,
              result: { ...company, status: 'error' },
            });
          }
        }

        completeBulkJob(jobId);
        send({ type: 'done', total: companies.length });
      } catch (err) {
        updateBulkJobStatus(jobId, 'error');
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
