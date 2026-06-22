'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BulkCompany, BulkJob } from '@/types/ads';
import { Download, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface BulkResultsTableProps {
  job: BulkJob;
  companies: BulkCompany[];
  onCompanyClick: (company: BulkCompany) => void;
  onExport: () => void;
}

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  done: { label: '✅ Running', class: 'bg-green-500/10 text-green-600 border-green-200' },
  not_found: { label: '❌ No ads', class: 'bg-muted text-muted-foreground' },
  pending: { label: '⏳ Pending', class: 'bg-muted text-muted-foreground' },
  scraping: { label: '🔄 Scraping', class: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  error: { label: '⚠️ Error', class: 'bg-red-500/10 text-red-600 border-red-200' },
};

function getCompanyStatus(c: BulkCompany): string {
  if (c.status === 'done' && c.active_ads_count > 0) return '✅ Running';
  if (c.status === 'done' && c.active_ads_count === 0 && c.inactive_ads_count > 0) return '⏸ Stopped';
  if (c.status === 'not_found') return '❌ No ads';
  return STATUS_BADGE[c.status]?.label || c.status;
}

export function BulkResultsTable({ job, companies, onCompanyClick, onExport }: BulkResultsTableProps) {
  const progress = job.total_companies > 0 ? (job.completed_companies / job.total_companies) * 100 : 0;
  const isRunning = job.status === 'running' || job.status === 'queued';

  return (
    <div className="space-y-4">
      {/* Job header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{job.name}</h3>
            {isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {job.completed_companies} / {job.total_companies} companies scraped
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onExport} disabled={job.completed_companies === 0}>
          <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
        </Button>
      </div>

      <Progress value={progress} className="h-2" />

      {/* Stats summary */}
      {job.completed_companies > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active Advertisers', value: companies.filter((c) => c.active_ads_count > 0).length, color: 'text-green-600' },
            { label: 'Stopped Running', value: companies.filter((c) => c.active_ads_count === 0 && c.inactive_ads_count > 0).length, color: 'text-yellow-600' },
            { label: 'No Ads Found', value: companies.filter((c) => c.status === 'not_found' || (c.status === 'done' && c.active_ads_count === 0 && c.inactive_ads_count === 0)).length, color: 'text-muted-foreground' },
          ].map((s) => (
            <div key={s.label} className="border rounded-lg p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <ScrollArea className="h-[calc(100vh-380px)] border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted border-b">
            <tr>
              {['Company', 'Status', 'Active', 'Inactive', 'Ad Types', 'Platforms', 'Last Ad', ''].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => onCompanyClick(c)}>
                <td className="px-3 py-2.5 font-medium">{c.company_name}</td>
                <td className="px-3 py-2.5">
                  <span className="text-xs">{getCompanyStatus(c)}</span>
                </td>
                <td className="px-3 py-2.5">
                  {c.status === 'done' || c.status === 'not_found' ? (
                    <span className={c.active_ads_count > 0 ? 'font-semibold text-green-600' : 'text-muted-foreground'}>
                      {c.active_ads_count}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{c.status === 'done' || c.status === 'not_found' ? c.inactive_ads_count : '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1 flex-wrap">
                    {c.ad_types.slice(0, 2).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs px-1 py-0">{t}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.platforms.join(', ') || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {c.last_ad_date ? formatDistanceToNow(new Date(c.last_ad_date), { addSuffix: true }) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  {(c.status === 'done' || c.status === 'not_found') && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {companies.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">Waiting for results...</div>
        )}
      </ScrollArea>
    </div>
  );
}
