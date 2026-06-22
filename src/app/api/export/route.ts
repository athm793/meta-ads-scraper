import { NextRequest, NextResponse } from 'next/server';
import { queryAds } from '@/lib/db';
import { adsToCsv, exportFilename } from '@/lib/exportCsv';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const format = searchParams.get('format') || 'csv';
  const jobId = searchParams.get('job_id') || undefined;
  const savedOnly = searchParams.get('saved') === 'true';
  const label = savedOnly ? 'saved' : 'search';

  const { ads } = queryAds({ job_id: jobId, saved: savedOnly || undefined, limit: 10000 });

  if (format === 'json') {
    return new NextResponse(JSON.stringify(ads, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename('meta-ads', label).replace(/\.csv$/, '.json')}"`,
      },
    });
  }

  const csv = adsToCsv(ads);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename('meta-ads', label)}"`,
    },
  });
}
