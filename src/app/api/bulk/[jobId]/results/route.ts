import { NextResponse } from 'next/server';
import { getBulkJob, getBulkJobCompanies } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getBulkJob(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const companies = getBulkJobCompanies(jobId);
  return NextResponse.json({ job, companies });
}
