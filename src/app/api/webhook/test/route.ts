import { NextRequest, NextResponse } from 'next/server';
import { testWebhook } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { url, secret, source } = await req.json();
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ ok: false, error: 'No webhook URL provided', signed: !!secret }, { status: 400 });
  }
  const result = await testWebhook({ url, secret, enabled: true }, source === 'bulk' ? 'bulk' : 'search');
  return NextResponse.json(result);
}
