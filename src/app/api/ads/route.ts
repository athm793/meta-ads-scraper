import { NextRequest, NextResponse } from 'next/server';
import { queryAds } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const result = queryAds({
    search: searchParams.get('search') || undefined,
    advertiser: searchParams.get('advertiser') || undefined,
    status: searchParams.get('status') || undefined,
    saved: searchParams.get('saved') === 'true' ? true : searchParams.get('saved') === 'false' ? false : undefined,
    collection_id: searchParams.get('collection_id') || undefined,
    session_id: searchParams.get('session_id') || undefined,
    tag_id: searchParams.get('tag_id') || undefined,
    job_id: searchParams.get('job_id') || undefined,
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 24),
    sort: searchParams.get('sort') || 'scraped_at',
  });
  return NextResponse.json(result);
}
