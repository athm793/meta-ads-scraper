'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { BulkCompany, BulkJob } from '@/types/ads';
import { Download, ChevronRight, Loader2, Play, Pause, Square, Trash2, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Pagination } from './Pagination';
import { companyResultsUrl } from '@/lib/adLibraryUrl';

interface BulkResultsTableProps {
  job: BulkJob;
  companies: BulkCompany[];
  onCompanyClick: (company: BulkCompany) => void;
  onExport: () => void;
  onExportAds?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  dedupCount?: number;
}

const PER_PAGE = 25;

const JOB_STATUS_META: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  running: { label: 'Running', className: 'bg-red-500/15 text-red-400 border-red-500/20' },
  paused: { label: 'Paused', className: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  complete: { label: 'Complete', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  cancelled: { label: 'Stopped', className: 'bg-muted text-muted-foreground border-border' },
  error: { label: 'Error', className: 'bg-red-500/15 text-red-400 border-red-500/20' },
};

function StatusDot({ status, activeCount, jobLive }: { status: string; activeCount: number; jobLive: boolean }) {
  if (status === 'scraping') {
    // Only spin while the job is actually running. If it was stopped/paused, a
    // lingering "scraping" row is interrupted work, not live — show it as such.
    if (!jobLive) {
      return <span className="text-xs text-muted-foreground/60">Interrupted</span>;
    }
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Scraping
      </span>
    );
  }
  if (status === 'pending') {
    return <span className="text-xs text-muted-foreground/60">Pending</span>;
  }
  if (status === 'error') {
    return <span className="flex items-center gap-1.5 text-xs text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />Error</span>;
  }
  if (status === 'not_found' || (status === 'done' && activeCount === 0)) {
    return <span className="text-xs text-muted-foreground">No ads</span>;
  }
  if (status === 'done' && activeCount > 0) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
        Active
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{status}</span>;
}

export function BulkResultsTable({ job, companies, onCompanyClick, onExport, onExportAds, onPause, onResume, onStop, onDelete, dedupCount = 0 }: BulkResultsTableProps) {
  const [page, setPage] = useState(1);
  const progress = job.total_companies > 0 ? (job.completed_companies / job.total_companies) * 100 : 0;
  const isRunning = job.status === 'running' || job.status === 'queued';
  const isPaused = job.status === 'paused';
  const canControl = isRunning || isPaused;
  const statusMeta = JOB_STATUS_META[job.status] ?? { label: job.status, className: 'bg-muted text-muted-foreground border-border' };
  const totalPages = Math.max(1, Math.ceil(companies.length / PER_PAGE));
  const pageCompanies = companies.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{job.name}</h3>
            {isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${statusMeta.className}`}>
              {statusMeta.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {job.completed_companies} / {job.total_companies} companies scraped
            {dedupCount > 0 && (
              <span className="ml-2 text-violet-400">· {dedupCount} duplicate ads removed</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canControl && (isRunning ? (
            <Button size="sm" variant="outline" onClick={onPause}>
              <Pause className="w-3.5 h-3.5 mr-1" /> Pause
            </Button>
          ) : (
            <Button size="sm" onClick={onResume}>
              <Play className="w-3.5 h-3.5 mr-1" /> Resume
            </Button>
          ))}
          {canControl && (
            <Button
              size="sm"
              variant="outline"
              onClick={onStop}
              className="text-red-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Square className="w-3.5 h-3.5 mr-1" /> Stop
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onExport} disabled={job.completed_companies === 0}>
            <Download className="w-3.5 h-3.5 mr-1" /> Companies
          </Button>
          {onExportAds && (
            <Button size="sm" variant="outline" onClick={onExportAds} disabled={job.completed_companies === 0}>
              <Download className="w-3.5 h-3.5 mr-1" /> Ads + details
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              className="text-red-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Progress value={progress} className="h-1.5" />

      {/* Stats */}
      {job.completed_companies > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { label: 'Active Advertisers', value: companies.filter((c) => c.active_ads_count > 0).length, color: 'text-emerald-400' },
            { label: 'Stopped Running', value: companies.filter((c) => c.status === 'done' && c.active_ads_count === 0 && c.inactive_ads_count > 0).length, color: 'text-yellow-400' },
            { label: 'No Ads Found', value: companies.filter((c) => c.status === 'not_found' || (c.status === 'done' && c.active_ads_count === 0 && c.inactive_ads_count === 0)).length, color: 'text-muted-foreground' },
          ].map((s) => (
            <div key={s.label} className="border border-border/50 rounded-lg p-3 text-center bg-card/30">
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Table */}
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border/50">
            <tr>
              {['Company', 'Status', 'Active', 'Inactive', 'Ad Types', 'Platforms', 'Page', 'Last Ad', ''].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground first:pl-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {pageCompanies.map((c, i) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, delay: Math.min(i * 0.02, 0.3) }}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => onCompanyClick(c)}
                >
                  <td className="px-3 py-2.5 pl-4 font-medium">
                    {c.company_name}
                    {c.matched_name && c.matched_name.toLowerCase() !== c.company_name.toLowerCase() && (
                      <span className="block text-[11px] font-normal text-muted-foreground">→ {c.matched_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusDot status={c.status} activeCount={c.active_ads_count} jobLive={isRunning} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {c.status === 'done' || c.status === 'not_found' ? (
                      <span className={c.active_ads_count > 0 ? 'font-semibold text-emerald-400' : 'text-muted-foreground'}>
                        {c.active_ads_count}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                    {c.status === 'done' || c.status === 'not_found' ? c.inactive_ads_count : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {c.ad_types.slice(0, 2).map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-4">{t}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{c.platforms.join(', ') || '—'}</td>
                  <td className="px-3 py-2.5">
                    {(c.status === 'done' || c.status === 'not_found') ? (
                      <a
                        href={companyResultsUrl({ matched_page_id: c.matched_page_id, company_name: c.company_name })}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={c.matched_page_id ? 'Open matched brand page on Meta' : 'Open keyword search on Meta'}
                        className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {c.matched_page_id ? 'Page' : 'Search'}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {c.last_ad_date ? formatDistanceToNow(new Date(c.last_ad_date), { addSuffix: true }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 pr-4">
                    {(c.status === 'done' || c.status === 'not_found') && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>

        {companies.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {isRunning ? 'Scraping in progress...' : 'No results yet'}
          </div>
        )}
      </div>

      {/* Pagination — centered */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={companies.length}
        perPage={PER_PAGE}
        onPage={setPage}
      />
    </div>
  );
}
