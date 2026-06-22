import { NextRequest, NextResponse } from 'next/server';
import { getTags, createTag, deleteTag } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getTags());
}

export async function POST(req: NextRequest) {
  const { name, color } = await req.json();
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  return NextResponse.json(createTag(String(name).trim(), color));
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteTag(id);
  return NextResponse.json({ ok: true });
}
