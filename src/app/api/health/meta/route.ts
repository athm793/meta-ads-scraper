import { NextRequest, NextResponse } from 'next/server';
import { searchAdvertisers } from '@/lib/scraper';
import { snapshot } from '@/lib/metaHealth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Meta API health.
//   GET /api/health/meta            → last-known status of each Meta integration
//   GET /api/health/meta?probe=1    → actively re-test the typeahead query first
//
// "probe" drives a real headless browser, so it's slower and shouldn't be polled
// tightly — use it for an on-demand "is Meta still working?" check.
export async function GET(req: NextRequest) {
  const probe = req.nextUrl.searchParams.get('probe');
  if (probe) {
    // searchAdvertisers records typeahead health as a side effect; swallow the
    // signature error here since the snapshot already reflects it.
    try { await searchAdvertisers('nike', 'US'); } catch { /* recorded in snapshot */ }
  }
  const health = snapshot();
  return NextResponse.json(health, {
    status: health.status === 'down' ? 503 : 200,
  });
}
