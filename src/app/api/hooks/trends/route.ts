import { NextResponse } from 'next/server';
import { getHookSamples } from '@/lib/db';
import { primaryAngle, ANGLES } from '@/lib/hooks';

export const dynamic = 'force-dynamic';

// Buckets stored ads by the week they started running and classifies each ad's
// hook, so the UI can show which angles are rising / falling over time.
export async function GET() {
  const samples = getHookSamples();

  // ISO week-start (Monday) key for a date string
  function weekKey(iso: string): string | null {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }

  const buckets = new Map<string, Record<string, number>>();
  for (const s of samples) {
    let body: string[] = [];
    try { body = JSON.parse(s.body_variants || '[]'); } catch { continue; }
    const hook = body[0]?.split('\n')[0]?.trim();
    if (!hook) continue;
    const wk = weekKey(s.started_at || s.scraped_at);
    if (!wk) continue;
    const angle = primaryAngle(hook);
    const b = buckets.get(wk) ?? {};
    b[angle] = (b[angle] || 0) + 1;
    buckets.set(wk, b);
  }

  const periods = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, angles]) => ({
      week,
      total: Object.values(angles).reduce((s, n) => s + n, 0),
      angles,
    }));

  // Delta: share of each angle in the latest period vs the previous one
  const deltas: Record<string, number> = {};
  if (periods.length >= 2) {
    const last = periods[periods.length - 1];
    const prev = periods[periods.length - 2];
    const share = (p: typeof last, k: string) => (p.total > 0 ? (p.angles[k] || 0) / p.total : 0);
    for (const a of ANGLES) deltas[a.key] = +((share(last, a.key) - share(prev, a.key)) * 100).toFixed(1);
  }

  return NextResponse.json({ periods, deltas });
}
