'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Play, Pause, Square, FileText, X, History, CheckCircle2, Loader2, Clock, Columns3, Archive, ArchiveRestore, Trash2, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import Papa from 'papaparse';
import type { BulkJob, MediaType, Platform } from '@/types/ads';
import { formatDistanceToNow } from 'date-fns';
import { CountryCombobox } from './CountryCombobox';

const MEDIA_OPTS: { value: MediaType; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'meme', label: 'Meme' },
  { value: 'multi_video', label: 'Multi-video' },
];
const PLATFORM_OPTS: { value: Platform; label: string }[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'AUDIENCE_NETWORK', label: 'Audience Net' },
  { value: 'MESSENGER', label: 'Messenger' },
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

interface BulkUploadProps {
  onStart: (jobId: string) => void;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  complete: { label: 'Complete', color: 'text-emerald-400' },
  running: { label: 'Running', color: 'text-red-400' },
  queued: { label: 'Queued', color: 'text-yellow-400' },
  paused: { label: 'Paused', color: 'text-orange-400' },
  cancelled: { label: 'Stopped', color: 'text-muted-foreground' },
  error: { label: 'Error', color: 'text-red-400' },
};

const ACTIVE_STATUSES = new Set(['running', 'queued', 'paused']);

const NO_COLUMN = '__none__';

type CompanyRow = { company_name: string; website?: string; category?: string };

// Case-insensitive dedup by company name; returns kept rows + how many dropped.
function dedupeCompanies(list: CompanyRow[]): { companies: CompanyRow[]; dupes: number } {
  const seen = new Set<string>();
  const companies: CompanyRow[] = [];
  let dupes = 0;
  for (const c of list) {
    const name = (c.company_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    companies.push({ company_name: name, website: c.website?.trim() || undefined, category: c.category?.trim() || undefined });
  }
  return { companies, dupes };
}

function guessColumn(fields: string[], patterns: RegExp): string | null {
  for (const p of patterns ? [patterns] : []) {
    const hit = fields.find((f) => p.test(f));
    if (hit) return hit;
  }
  return null;
}

function JobStatusIcon({ status }: { status: string }) {
  if (status === 'complete') return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
  if (status === 'running') return <Loader2 className="w-3 h-3 text-red-400 animate-spin" />;
  if (status === 'paused') return <Pause className="w-3 h-3 text-orange-400" />;
  return <Clock className="w-3 h-3" />;
}

interface JobRowProps {
  job: BulkJob;
  onStart: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onStop?: (id: string) => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function IconBtn({ title, onClick, className, children }: { title: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn('p-1.5 rounded-md text-muted-foreground transition-colors', className)}
    >
      {children}
    </button>
  );
}

function JobRow({ job, onStart, onPause, onResume, onStop, onArchive, onUnarchive, onDelete }: JobRowProps) {
  const meta = STATUS_META[job.status] ?? { label: job.status, color: 'text-muted-foreground' };
  const active = job.status === 'running' || job.status === 'queued';
  const paused = job.status === 'paused';
  return (
    <div className="group flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors">
      <button onClick={() => onStart(job.id)} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate">{job.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <JobStatusIcon status={job.status} />
          <span className={meta.color}>{meta.label}</span>
          <span>·</span>
          <span>{job.completed_companies}/{job.total_companies} companies</span>
          <span>·</span>
          <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
        </p>
      </button>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {active && onPause && (
          <IconBtn title="Pause" onClick={() => onPause(job.id)} className="hover:text-foreground hover:bg-muted">
            <Pause className="w-3.5 h-3.5" />
          </IconBtn>
        )}
        {paused && onResume && (
          <IconBtn title="Resume" onClick={() => onResume(job.id)} className="hover:text-emerald-400 hover:bg-emerald-500/10">
            <Play className="w-3.5 h-3.5" />
          </IconBtn>
        )}
        {(active || paused) && onStop && (
          <IconBtn title="Stop" onClick={() => onStop(job.id)} className="hover:text-red-400 hover:bg-red-500/10">
            <Square className="w-3.5 h-3.5" />
          </IconBtn>
        )}
        {onArchive && !active && !paused && (
          <IconBtn title="Archive" onClick={() => onArchive(job.id)} className="hover:text-foreground hover:bg-muted">
            <Archive className="w-3.5 h-3.5" />
          </IconBtn>
        )}
        {onUnarchive && (
          <IconBtn title="Unarchive" onClick={() => onUnarchive(job.id)} className="hover:text-foreground hover:bg-muted">
            <ArchiveRestore className="w-3.5 h-3.5" />
          </IconBtn>
        )}
        {onDelete && (
          <IconBtn title="Delete permanently" onClick={() => onDelete(job.id)} className="hover:text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" />
          </IconBtn>
        )}
      </div>
    </div>
  );
}

export function BulkUpload({ onStart }: BulkUploadProps) {
  const [jobName, setJobName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [companyCol, setCompanyCol] = useState('');
  const [websiteCol, setWebsiteCol] = useState(NO_COLUMN);
  const [categoryCol, setCategoryCol] = useState(NO_COLUMN);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [scopeStatus, setScopeStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [scopeMedia, setScopeMedia] = useState<MediaType[]>([]);
  const [scopePlatforms, setScopePlatforms] = useState<Platform[]>([]);
  const [fetchDetails, setFetchDetails] = useState(false);
  const [matchPages, setMatchPages] = useState(true);
  const [matchCountry, setMatchCountry] = useState('US');
  const [workers, setWorkers] = useState(4);

  // Restore the last-used worker count so it persists between runs/startups
  useEffect(() => {
    const v = Number(localStorage.getItem('mas_bulk_workers'));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v >= 1 && v <= 20) setWorkers(v);
  }, []);

  function changeWorkers(v: number) {
    const n = Math.min(20, Math.max(1, v));
    setWorkers(n);
    try { localStorage.setItem('mas_bulk_workers', String(n)); } catch { /* ignore */ }
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: pastJobs = [] } = useQuery<BulkJob[]>({
    queryKey: ['bulk-jobs'],
    queryFn: () => fetch('/api/bulk').then((r) => r.json()),
    // Keep the list fresh so active jobs show live progress
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  const { data: archivedJobs = [] } = useQuery<BulkJob[]>({
    queryKey: ['bulk-jobs', 'archived'],
    queryFn: () => fetch('/api/bulk?archived=1').then((r) => r.json()),
    enabled: showArchived,
  });

  const activeJobs = pastJobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  const finishedJobs = pastJobs.filter((j) => !ACTIVE_STATUSES.has(j.status));

  function refreshJobs() {
    queryClient.invalidateQueries({ queryKey: ['bulk-jobs'] });
  }

  async function archiveJob(id: string) {
    await fetch(`/api/bulk/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    refreshJobs();
  }

  async function unarchiveJob(id: string) {
    await fetch(`/api/bulk/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    refreshJobs();
  }

  async function deleteJob(id: string) {
    if (!window.confirm('Delete this job permanently? This removes the run and its company results (scraped ad data is kept).')) return;
    await fetch(`/api/bulk/${id}`, { method: 'DELETE' });
    refreshJobs();
  }

  async function controlJob(id: string, action: 'pause' | 'resume' | 'stop') {
    await fetch(`/api/bulk/${id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    refreshJobs();
    // Resuming needs an open stream to actually progress — open the job screen.
    if (action === 'resume') onStart(id);
  }

  // Single source of truth: companies are derived (and deduped) from either the
  // pasted text or the uploaded CSV + the chosen column mapping.
  const { companies, dupes } = useMemo(() => {
    if (fileName) {
      const mapped = rawRows.map((row) => ({
        company_name: companyCol ? (row[companyCol] ?? '') : '',
        website: websiteCol !== NO_COLUMN ? (row[websiteCol] ?? '') : undefined,
        category: categoryCol !== NO_COLUMN ? (row[categoryCol] ?? '') : undefined,
      }));
      return dedupeCompanies(mapped);
    }
    const lines = textInput.split('\n').map((l) => ({ company_name: l }));
    return dedupeCompanies(lines);
  }, [fileName, rawRows, companyCol, websiteCol, categoryCol, textInput]);

  function handleTextChange(val: string) {
    setTextInput(val);
    setFileName(null);
    setRawRows([]);
    setColumns([]);
  }

  function clearList() {
    setTextInput('');
    setFileName(null);
    setRawRows([]);
    setColumns([]);
    setCompanyCol('');
    setWebsiteCol(NO_COLUMN);
    setCategoryCol(NO_COLUMN);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = (results.meta.fields ?? []).filter(Boolean);
        // Auto-guess the right columns; the user can re-map below.
        const guessedCompany =
          guessColumn(fields, /^(company[\s_-]?name|company|name|account|business|organization)$/i) ||
          guessColumn(fields, /(company|name|account|business)/i) ||
          fields[0] || '';
        const guessedWebsite =
          guessColumn(fields, /^(website|domain|url|site|web)$/i) ||
          guessColumn(fields, /(website|domain|url)/i) ||
          NO_COLUMN;
        const guessedCategory =
          guessColumn(fields, /^(category|industry|type|sector|vertical)$/i) ||
          guessColumn(fields, /(category|industry|sector|vertical)/i) ||
          NO_COLUMN;
        setRawRows(results.data);
        setColumns(fields);
        setCompanyCol(guessedCompany);
        setWebsiteCol(guessedWebsite);
        setCategoryCol(guessedCategory);
        setFileName(file.name);
        setTextInput('');
      },
    });
  }

  async function handleStart() {
    if (companies.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/bulk/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: jobName || `Bulk job ${new Date().toLocaleDateString()}`,
          companies,
          filters: {
            status: scopeStatus,
            media_types: scopeMedia,
            platforms: scopePlatforms,
            fetch_details: fetchDetails,
            match_pages: matchPages,
            country: matchCountry,
            workers,
          },
        }),
      });
      const job = await res.json();
      onStart(job.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="text-center space-y-1.5"
      >
        <h2 className="text-xl font-semibold">Bulk Company Intelligence</h2>
        <p className="text-sm text-muted-foreground">
          Upload a list of companies to check their Meta ad activity in parallel
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.05 }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label>Job Name (optional)</Label>
          <Input
            placeholder="e.g. Prospect list June 2026"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Label>Company List</Label>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1" /> Upload CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>

          {fileName ? (
            /* Compact card for an uploaded CSV — no giant list re-render */
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden"
            >
              <div className="px-3 py-2.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{fileName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="text-foreground font-medium tabular-nums">{companies.length.toLocaleString()}</span> unique companies
                    {dupes > 0 && (
                      <span className="text-violet-400">{' · '}{dupes.toLocaleString()} duplicate{dupes === 1 ? '' : 's'} removed</span>
                    )}
                    {companies.length > 0 && (
                      <span className="text-muted-foreground/70">
                        {' · '}{companies.slice(0, 3).map((c) => c.company_name).join(', ')}
                        {companies.length > 3 ? `, +${(companies.length - 3).toLocaleString()} more` : ''}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={clearList}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              </div>

              {/* Column mapping */}
              {columns.length > 0 && (
                <div className="border-t border-border/40 bg-background/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-2">
                    <Columns3 className="w-3 h-3" /> Map columns
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Company name</Label>
                      <Select value={companyCol} onValueChange={(v) => v && setCompanyCol(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select column" /></SelectTrigger>
                        <SelectContent>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Website (optional)</Label>
                      <Select value={websiteCol} onValueChange={(v) => v && setWebsiteCol(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_COLUMN} className="text-xs">None</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[11px] text-muted-foreground">Category / type (optional — improves brand match)</Label>
                      <Select value={categoryCol} onValueChange={(v) => v && setCategoryCol(v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_COLUMN} className="text-xs">None</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <>
              <Textarea
                placeholder="One company name per line&#10;Nike&#10;Apple&#10;Shopify&#10;HubSpot"
                rows={8}
                value={textInput}
                onChange={(e) => handleTextChange(e.target.value)}
                className="font-mono text-sm resize-none"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  {companies.length > 0 ? (
                    <>
                      <Badge variant="secondary">{companies.length.toLocaleString()} unique companies</Badge>
                      {dupes > 0 && <span className="text-violet-400">{dupes.toLocaleString()} duplicate{dupes === 1 ? '' : 's'} removed</span>}
                    </>
                  ) : 'Paste company names or upload a CSV with a "company_name" column'}
                </span>
                {companies.length > 0 && (
                  <button
                    onClick={clearList}
                    className="hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Search scope */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <SlidersHorizontal className="w-3 h-3" /> Search scope
          </div>

          {/* Match mode */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Match each company by</Label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setMatchPages(true)}
                className={`flex-1 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${matchPages ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
              >
                Brand page
              </button>
              <button
                onClick={() => setMatchPages(false)}
                className={`flex-1 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${!matchPages ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
              >
                Keyword
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              {matchPages
                ? 'Resolves each name to its advertiser page and scrapes that page’s full library (most accurate). Falls back to keyword if no page is found.'
                : 'Keyword search of the name across all advertisers (may include lookalikes).'}
            </p>
          </div>

          {/* Brand-lookup country — disambiguates same-name brands by market */}
          {matchPages && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Look up brands in</Label>
              <CountryCombobox value={matchCountry} onChange={setMatchCountry} placeholder="United States" />
              <p className="text-[11px] text-muted-foreground/70">
                Picks the right brand by market. Add a <span className="font-medium">category</span> column to your CSV to disambiguate further.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Status</Label>
            <div className="flex gap-1.5">
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScopeStatus(s)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${scopeStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                >
                  {s === 'ALL' ? 'Both' : s === 'ACTIVE' ? 'Active' : 'Inactive'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Media types {scopeMedia.length === 0 && <span className="text-muted-foreground/50">(all)</span>}</Label>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA_OPTS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setScopeMedia((prev) => toggle(prev, m.value))}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${scopeMedia.includes(m.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Platforms {scopePlatforms.length === 0 && <span className="text-muted-foreground/50">(all)</span>}</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_OPTS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setScopePlatforms((prev) => toggle(prev, p.value))}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${scopePlatforms.includes(p.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Parallel workers</Label>
              <span className="text-xs font-semibold tabular-nums text-foreground">{workers}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={workers}
              onChange={(e) => changeWorkers(Number(e.target.value))}
              className="w-full h-1.5 accent-primary cursor-pointer"
            />
            <p className="text-[11px] text-muted-foreground/70">
              Companies scraped at once. Higher = faster but raises the chance Meta rate-limits you; 4–6 is a safe sweet spot. Saved for next time.
            </p>
          </div>

          <button
            onClick={() => setFetchDetails((v) => !v)}
            className="flex items-center gap-2 w-full text-left pt-1"
          >
            <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${fetchDetails ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${fetchDetails ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </span>
            <span className="text-xs">
              <span className="font-medium">Fetch ad details</span>
              <span className="text-muted-foreground"> — pull EU transparency data (reach, demographics) per ad. Slower.</span>
            </span>
          </button>
          {fetchDetails && (
            <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5 leading-relaxed">
              Reach &amp; demographics only exist for advertisers running ads in the EU (EU transparency law). Non-EU advertisers will return blank details — that&apos;s a Meta limitation, not a failed scrape.
            </p>
          )}
        </div>

        <Button
          onClick={handleStart}
          disabled={companies.length === 0 || loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" />Start Bulk Scrape ({companies.length.toLocaleString()} companies)</>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          {workers} {workers === 1 ? 'company' : 'companies'} scraped in parallel with shared deduplication.
        </p>
      </motion.div>

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.08 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
            </span>
            Active Jobs
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{activeJobs.length}</Badge>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] divide-y divide-border/30 overflow-hidden">
            {activeJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onStart={onStart}
                onPause={(id) => controlJob(id, 'pause')}
                onResume={(id) => controlJob(id, 'resume')}
                onStop={(id) => controlJob(id, 'stop')}
                onDelete={deleteJob}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Previous jobs */}
      {(finishedJobs.length > 0 || showArchived) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.1 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <History className="w-3.5 h-3.5" />
            Previous Jobs
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{finishedJobs.length}</Badge>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="ml-auto flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Archive className="w-3 h-3" />
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          </div>
          {finishedJobs.length > 0 ? (
            <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden max-h-80 overflow-y-auto">
              {finishedJobs.map((job) => (
                <JobRow key={job.id} job={job} onStart={onStart} onArchive={archiveJob} onDelete={deleteJob} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 px-1 py-2">No previous jobs.</p>
          )}
        </motion.div>
      )}

      {/* Archived jobs */}
      {showArchived && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Archive className="w-3.5 h-3.5" />
            Archived
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{archivedJobs.length}</Badge>
          </div>
          {archivedJobs.length > 0 ? (
            <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/30 overflow-hidden max-h-80 overflow-y-auto">
              {archivedJobs.map((job) => (
                <JobRow key={job.id} job={job} onStart={onStart} onUnarchive={unarchiveJob} onDelete={deleteJob} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 px-1 py-2">No archived jobs.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
