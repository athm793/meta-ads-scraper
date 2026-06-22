import { NextRequest, NextResponse } from 'next/server';
import { getAdTags, addTagToAd, removeTagFromAd, createTag } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — tags currently on this ad
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(getAdTags(id));
}

// POST — attach a tag. Accepts { tag_id } for an existing tag, or { name, color }
// to create-then-attach a new one. Returns the ad's updated tag list.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  let tagId: string | undefined = body.tag_id;
  if (!tagId && body.name) {
    tagId = createTag(String(body.name).trim(), body.color).id;
  }
  if (!tagId) return NextResponse.json({ error: 'tag_id or name required' }, { status: 400 });
  addTagToAd(id, tagId);
  return NextResponse.json(getAdTags(id));
}

// DELETE — remove a tag from this ad: { tag_id }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tag_id } = await req.json().catch(() => ({}));
  if (!tag_id) return NextResponse.json({ error: 'tag_id required' }, { status: 400 });
  removeTagFromAd(id, tag_id);
  return NextResponse.json(getAdTags(id));
}
