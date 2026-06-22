import { NextResponse } from 'next/server';
import { getBulkJobCompanies } from '@/lib/db';
import type { BulkCompany } from '@/types/ads';

const HEADER = [
  'Company Name', 'Status', 'Active Ads', 'Inactive Ads', 'Total Ads',
  'Ad Types', 'Platforms', 'Spend Range', 'Last Ad Date', 'Scraped At',
].map((h) => `"${h}"`).join(',');

function toRow(c: BulkCompany): string {
  const fields = [
    c.company_name,
    c.status,
    String(c.active_ads_count),
    String(c.inactive_ads_count),
    String(c.active_ads_count + c.inactive_ads_count),
    c.ad_types.join(', '),
    c.platforms.join(', '),
    c.spend_range || 'N/A',
    c.last_ad_date || '',
    c.scraped_at || '',
  ];
  return fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(',');
}

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const companies = getBulkJobCompanies(jobId);
  const csv = [HEADER, ...companies.map(toRow)].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="bulk-results.csv"',
    },
  });
}
