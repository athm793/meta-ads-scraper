import { NextResponse } from 'next/server';
import { getBulkJobCompanies, getAdsByBulkJob, getBulkJob } from '@/lib/db';
import { adsToCsv, exportFilename, BOM } from '@/lib/exportCsv';
import { companyResultsUrl } from '@/lib/adLibraryUrl';
import type { BulkCompany } from '@/types/ads';

const HEADER = [
  'Company Name', 'Matched Page', 'Facebook Username', 'Instagram Username', 'Match Method',
  'Ad Library URL', 'Status', 'Active Ads', 'Inactive Ads', 'Total Ads',
  'Ad Types', 'Platforms', 'Spend Range', 'Last Ad Date', 'Scraped At',
].map((h) => `"${h}"`).join(',');

const MATCH_LABEL: Record<string, string> = {
  page_id: 'Page URL/ID', handle_fb: 'FB handle', handle_ig: 'IG handle', keyword: 'Keyword',
};

function toRow(c: BulkCompany): string {
  const fields = [
    c.company_name,
    c.matched_name || (c.matched_page_id ? '' : 'keyword search'),
    c.fb_handle || '',
    c.ig_handle || '',
    c.match_method ? (MATCH_LABEL[c.match_method] ?? c.match_method) : (c.status === 'unverified' ? 'Unverified' : ''),
    companyResultsUrl({ matched_page_id: c.matched_page_id, company_name: c.company_name }),
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

export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const type = new URL(req.url).searchParams.get('type');
  const jobName = getBulkJob(jobId)?.name;

  // type=ads → full per-ad export (incl. "See ad details" / EU transparency),
  // augmented with each ad's brand handles (joined via company id).
  if (type === 'ads') {
    const handleByCompany = new Map(
      getBulkJobCompanies(jobId).map((c) => [c.id, { fb: c.fb_handle || '', ig: c.ig_handle || '' }])
    );
    const csv = adsToCsv(getAdsByBulkJob(jobId), {
      headers: ['Facebook Username', 'Instagram Username'],
      row: (ad) => {
        const h = ad.scrape_job_id ? handleByCompany.get(ad.scrape_job_id) : undefined;
        return [h?.fb || '', h?.ig || ''];
      },
    });
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename('bulk-ads', jobName)}"`,
      },
    });
  }

  // default → per-company summary
  const companies = getBulkJobCompanies(jobId);
  const csv = BOM + [HEADER, ...companies.map(toRow)].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename('bulk-companies', jobName)}"`,
    },
  });
}
