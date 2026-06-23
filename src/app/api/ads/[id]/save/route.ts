import { NextRequest, NextResponse } from 'next/server';
import { setAdSaved, getSearchSession, getAdById, touchSearchSession } from '@/lib/db';
import { deliverWebhook, buildAdvertiserCompany } from '@/lib/webhook';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { saved, collection_id, session_id } = await req.json();
  setAdSaved(id, saved, collection_id);

  // If saved under the live session and it has a webhook URL that fires on save,
  // push the ad. (The client only sends session_id for the live/playing session.)
  if (saved && session_id) {
    const session = getSearchSession(session_id);
    if (session?.webhook_url && (session.fire_on === 'save' || session.fire_on === 'both')) {
      const ad = getAdById(id);
      if (ad) {
        // Same { job_id, company, ads } shape as a bulk company_done fire.
        deliverWebhook(
          { url: session.webhook_url, secret: session.webhook_secret, enabled: true },
          'search.ad_saved', 'search',
          {
            job_id: session.id,
            session_id: session.id,
            session_name: session.name,
            company: buildAdvertiserCompany(ad, session.id),
            ads: [ad],
          }
        );
        touchSearchSession(session.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
