import { NextRequest, NextResponse } from 'next/server';
import { getCollections, createCollection, deleteCollection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getCollections());
}

export async function POST(req: NextRequest) {
  const { name, color } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  return NextResponse.json(createCollection(name, color));
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteCollection(id);
  return NextResponse.json({ ok: true });
}
