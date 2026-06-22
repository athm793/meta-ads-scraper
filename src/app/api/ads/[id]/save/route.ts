import { NextRequest, NextResponse } from 'next/server';
import { setAdSaved } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { saved, collection_id } = await req.json();
  setAdSaved(id, saved, collection_id);
  return NextResponse.json({ ok: true });
}
