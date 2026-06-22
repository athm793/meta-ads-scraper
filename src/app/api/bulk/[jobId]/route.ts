import { NextRequest, NextResponse } from 'next/server';
import { getBulkJob, deleteBulkJob, setBulkJobArchived } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PATCH — archive / unarchive a job
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getBulkJob(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let archived: boolean;
  try {
    ({ archived } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  setBulkJobArchived(jobId, !!archived);
  return NextResponse.json(getBulkJob(jobId));
}

// DELETE — permanently remove a job and its company rows
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getBulkJob(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  deleteBulkJob(jobId);
  return NextResponse.json({ ok: true });
}
