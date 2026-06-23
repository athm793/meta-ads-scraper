import { NextRequest, NextResponse } from 'next/server';
import {
  listSearchSessions, createSearchSession, updateSearchSession, deleteSearchSession,
} from '@/lib/db';
import type { SessionFireOn } from '@/types/ads';

export const dynamic = 'force-dynamic';

const VALID_FIRE_ON: SessionFireOn[] = ['save', 'scrape', 'both'];

export async function GET() {
  return NextResponse.json(listSearchSessions());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const fire_on: SessionFireOn = VALID_FIRE_ON.includes(body.fire_on) ? body.fire_on : 'save';
  return NextResponse.json(createSearchSession({
    name,
    webhook_url: body.webhook_url || undefined,
    webhook_secret: body.webhook_secret || undefined,
    webhook_enabled: !!body.webhook_enabled,
    fire_on,
  }));
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (body.fire_on !== undefined && !VALID_FIRE_ON.includes(body.fire_on)) {
    return NextResponse.json({ error: 'invalid fire_on' }, { status: 400 });
  }
  const updated = updateSearchSession(body.id, {
    name: body.name !== undefined ? String(body.name).trim() : undefined,
    webhook_url: body.webhook_url,
    webhook_secret: body.webhook_secret,
    webhook_enabled: body.webhook_enabled,
    fire_on: body.fire_on,
  });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteSearchSession(id);
  return NextResponse.json({ ok: true });
}
