import { NextRequest, NextResponse } from 'next/server';
import { createBulkJob } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { name, companies, filters, webhook } = await req.json();
  if (!companies || !Array.isArray(companies) || companies.length === 0) {
    return NextResponse.json({ error: 'companies array required' }, { status: 400 });
  }
  const job = createBulkJob(name || `Bulk job ${new Date().toLocaleDateString()}`, companies, filters, webhook);
  return NextResponse.json(job);
}
