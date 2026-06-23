import { NextRequest, NextResponse } from 'next/server';
import { searchAdvertisers } from '@/lib/scraper';
import { MetaSignatureError } from '@/lib/metaHealth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Advertiser typeahead — returns matching Meta advertiser pages for a query.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  const country = req.nextUrl.searchParams.get('country') || 'US';
  if (q.trim().length < 2) return NextResponse.json([]);
  try {
    const results = await searchAdvertisers(q, country);
    return NextResponse.json(results);
  } catch (e) {
    // Meta renamed the typeahead query — flag it loudly (503) instead of an
    // empty list, so the client can tell the user the API changed.
    if (e instanceof MetaSignatureError) {
      return NextResponse.json(
        { error: e.message, code: e.code, signal: e.signal },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
