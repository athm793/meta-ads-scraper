import { NextRequest, NextResponse } from 'next/server';
import { queryAds } from '@/lib/db';
import type { Ad } from '@/types/ads';

export const dynamic = 'force-dynamic';

function adToCsvRow(ad: Ad): string {
  const fields = [
    ad.id,
    ad.advertiser_name,
    ad.status,
    ad.media_type,
    ad.body_variants.join(' | '),
    ad.headline || '',
    ad.cta_text || '',
    ad.link_url || '',
    ad.platforms.join(', '),
    ad.started_at || '',
    ad.stopped_at || '',
    String(ad.days_running ?? ''),
    ad.spend_min != null ? `${ad.spend_currency || '$'}${ad.spend_min}` : '',
    ad.spend_max != null ? `${ad.spend_currency || '$'}${ad.spend_max}` : '',
    ad.impressions_min != null ? String(ad.impressions_min) : '',
    ad.impressions_max != null ? String(ad.impressions_max) : '',
    ad.funding_entity || '',
    ad.ad_snapshot_url || '',
    ad.country || '',
    ad.language || '',
    ad.scraped_at,
  ];
  return fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(',');
}

const CSV_HEADER = [
  'ID', 'Advertiser', 'Status', 'Media Type', 'Ad Copy', 'Headline', 'CTA',
  'Landing URL', 'Platforms', 'Started', 'Stopped', 'Days Running',
  'Spend Min', 'Spend Max', 'Impressions Min', 'Impressions Max',
  'Funding Entity', 'Ad Library URL', 'Country', 'Language', 'Scraped At',
].map((h) => `"${h}"`).join(',');

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const format = searchParams.get('format') || 'csv';
  const jobId = searchParams.get('job_id') || undefined;
  const savedOnly = searchParams.get('saved') === 'true';

  const { ads } = queryAds({ job_id: jobId, saved: savedOnly || undefined, limit: 10000 });

  if (format === 'json') {
    return new NextResponse(JSON.stringify(ads, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="meta-ads.json"',
      },
    });
  }

  const csv = [CSV_HEADER, ...ads.map(adToCsvRow)].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="meta-ads.csv"',
    },
  });
}
