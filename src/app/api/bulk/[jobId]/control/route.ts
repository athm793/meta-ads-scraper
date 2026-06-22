import { NextRequest, NextResponse } from 'next/server';
import { getBulkJob, updateBulkJobStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Action = 'pause' | 'resume' | 'stop';

// The bulk scrape runs inside the SSE stream handler. This endpoint flips the
// job's status in the DB; the running worker polls that status between
// companies and reacts (pause = stop queuing, stop = cancel). Resume just marks
// the job runnable again — the client reopens the stream to continue.
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getBulkJob(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let action: Action;
  try {
    ({ action } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  if (action === 'pause') {
    if (job.status === 'running' || job.status === 'queued') {
      updateBulkJobStatus(jobId, 'paused');
    }
  } else if (action === 'resume') {
    if (job.status === 'paused' || job.status === 'error') {
      updateBulkJobStatus(jobId, 'queued');
    }
  } else if (action === 'stop') {
    if (job.status !== 'complete') {
      updateBulkJobStatus(jobId, 'cancelled');
    }
  } else {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }

  return NextResponse.json(getBulkJob(jobId));
}
