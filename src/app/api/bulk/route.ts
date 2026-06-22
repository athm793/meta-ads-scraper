import { getBulkJobs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const archived = new URL(req.url).searchParams.get('archived') === '1';
  const jobs = getBulkJobs(archived);
  return Response.json(jobs);
}
