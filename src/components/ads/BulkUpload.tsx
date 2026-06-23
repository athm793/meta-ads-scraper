'use client';

import { useState, useRef, useMemo, useEffect, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Upload, Play, Pause, Square, FileText, X, History, CheckCircle2, Loader2, Clock,
  Columns3, Archive, ArchiveRestore, Trash2, ArrowLeft, ArrowRight, Check,
  Building2, Target, Rocket, Globe, Tag, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Papa from 'papaparse';
import type { BulkJob, MediaType, Platform } from '@/types/ads';
import { formatDistanceToNow } from 'date-fns';
import { CountryCombobox } from './CountryCombobox';
import { WebhookTester } from './WebhookTester';
import { extractPageId } from '@/lib/adLibraryUrl';

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

type CompanyRow = { company_name: string; website?: string; category?: string; page_id?: string };

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
    companies.push({
      company_name: name,
      website: c.website?.trim() || undefined,
      category: c.category?.trim() || undefined,
      page_id: c.page_id || undefined,
    });
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

// ---- Wizard scaffolding ----

const STEPS = [
  { n: 1, label: 'Companies', icon: Building2 },
  { n: 2, label: 'Targeting', icon: Target },
  { n: 3, label: 'Run', icon: Rocket },
] as const;

function Stepper({ step, maxReached, onJump }: { step: number; maxReached: number; onJump: (n: number) => void }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        const reachable = s.n <= maxReached;
        const Icon = s.icon;
        return (
          <Fragment key={s.n}>
            <button
              onClick={() => reachable && onJump(s.n)}
              disabled={!reachable}
              className={cn('flex items-center gap-2 shrink-0', reachable && !active ? 'cursor-pointer' : 'cursor-default')}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full border text-xs font-semibold transition-colors',
                  active ? 'bg-primary text-primary-foreground border-primary'
                    : done ? 'bg-primary/15 text-primary border-primary/40'
                    : 'border-border text-muted-foreground'
                )}
              >
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </span>
              <span className={cn('text-sm font-medium hidden sm:inline', active ? 'text-foreground' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn('flex-1 h-px mx-2 sm:mx-3 transition-colors', step > s.n ? 'bg-primary/40' : 'bg-border')} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function CompanyPreview({ companies, dupes, onClear }: { companies: CompanyRow[]; dupes: number; onClear: () => void }) {
  if (companies.length === 0) return null;
  const shown = companies.slice(0, 60);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-500/15">
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-foreground tabular-nums">{companies.length.toLocaleString()}</span>
          <span className="text-muted-foreground">{companies.length === 1 ? 'company' : 'companies'} ready to scrape</span>
          {dupes > 0 && <span className="text-violet-400">· {dupes.toLocaleString()} duplicate{dupes === 1 ? '' : 's'} removed</span>}
        </div>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors shrink-0">
          <X className="w-3 h-3" /> Clear
        </button>
      </div>
      <div className="p-2.5 max-h-44 overflow-y-auto flex flex-wrap gap-1.5">
        {shown.map((c, i) => (
          <span
            key={`${c.company_name}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-background border border-border/60 text-xs max-w-full"
            title={[c.company_name, c.category].filter(Boolean).join(' · ')}
          >
            <span className="truncate max-w-[180px]">{c.company_name}</span>
            {c.category && <span className="text-[10px] text-muted-foreground shrink-0">· {c.category}</span>}
          </span>
        ))}
        {companies.length > shown.length && (
          <span className="inline-flex items-center px-2 py-1 text-xs text-muted-foreground">
            +{(companies.length - shown.length).toLocaleString()} more
          </span>
        )}
      </div>
    </motion.div>
  );
}

function SummaryRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-foreground font-medium truncate">{value}</span>
    </div>
  );
}

export function BulkUpload({ onStart }: BulkUploadProps) {
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [jobName, setJobName] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [companyCol, setCompanyCol] = useState('');
  const [websiteCol, setWebsiteCol] = useState(NO_COLUMN);
  const [categoryCol, setCategoryCol] = useState(NO_COLUMN);
  const [pageCol, setPageCol] = useState(NO_COLUMN);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [scopeStatus, setScopeStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [scopeMedia, setScopeMedia] = useState<MediaType[]>([]);
  const [scopePlatforms, setScopePlatforms] = useState<Platform[]>([]);
  const [fetchDetails, setFetchDetails] = useState(false);
  const [matchPages, setMatchPages] = useState(true);
  const [matchCountry, setMatchCountry] = useState('US');
  const [workers, setWorkers] = useState(4);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  // Restore the last-used worker count so it persists between runs/startups
  useEffect(() => {
    const v = Number(localStorage.getItem('mas_bulk_workers'));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v >= 1 && v <= 10) setWorkers(v);
  }, []);

  function changeWorkers(v: number) {
    const n = Math.min(10, Math.max(1, v));
    setWorkers(n);
    try { localStorage.setItem('mas_bulk_workers', String(n)); } catch { /* ignore */ }
  }

  function goTo(n: number) {
    setStep(n);
    setMaxReached((m) => Math.max(m, n));
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

  // Companies are derived (and deduped) from the uploaded CSV + column mapping.
  const { companies, dupes } = useMemo(() => {
    if (!fileName) return { companies: [], dupes: 0 };
    const mapped = rawRows.map((row) => ({
      company_name: companyCol ? (row[companyCol] ?? '') : '',
      website: websiteCol !== NO_COLUMN ? (row[websiteCol] ?? '') : undefined,
      category: categoryCol !== NO_COLUMN ? (row[categoryCol] ?? '') : undefined,
      page_id: pageCol !== NO_COLUMN ? (extractPageId(row[pageCol] ?? '') ?? undefined) : undefined,
    }));
    return dedupeCompanies(mapped);
  }, [fileName, rawRows, companyCol, websiteCol, categoryCol, pageCol]);

  // Brand-page matching needs a website column to do deterministic handle matching.
  const websiteMapped = websiteCol !== NO_COLUMN;
  const needsWebsite = matchPages;

  function clearList() {
    setFileName(null);
    setRawRows([]);
    setColumns([]);
    setCompanyCol('');
    setWebsiteCol(NO_COLUMN);
    setCategoryCol(NO_COLUMN);
    setPageCol(NO_COLUMN);
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
          guessColumn(fields, /^(website|domain|url|site|web|homepage)$/i) ||
          guessColumn(fields, /(website|domain|homepage|\burl\b)/i) ||
          NO_COLUMN;
        const guessedCategory =
          guessColumn(fields, /^(category|industry|type|sector|vertical)$/i) ||
          guessColumn(fields, /(category|industry|sector|vertical)/i) ||
          NO_COLUMN;
        const guessedPage =
          guessColumn(fields, /^(facebook|fb|meta)?[\s_-]?(page[\s_-]?(url|id|link)|ad[\s_-]?library)$/i) ||
          guessColumn(fields, /(page[\s_-]?id|page[\s_-]?url|facebook[\s_-]?url|fb[\s_-]?page)/i) ||
          NO_COLUMN;
        setRawRows(results.data);
        setColumns(fields);
        setCompanyCol(guessedCompany);
        setWebsiteCol(guessedWebsite);
        setCategoryCol(guessedCategory);
        setPageCol(guessedPage);
        setFileName(file.name);
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
          webhook: {
            url: webhookUrl.trim() || undefined,
            secret: webhookSecret.trim() || undefined,
            enabled: webhookEnabled && !!webhookUrl.trim(),
          },
        }),
      });
      const job = await res.json();
      onStart(job.id);
    } finally {
      setLoading(false);
    }
  }

  const [stepDir, setStepDir] = useState(1);
  function next() { setStepDir(1); goTo(Math.min(3, step + 1)); }
  function back() { setStepDir(-1); setStep((s) => Math.max(1, s - 1)); }

  const stepVariants = {
    enter: (d: number) => ({ opacity: 0, x: d > 0 ? 24 : -24 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d > 0 ? -24 : 24 }),
  };

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
          Check the Meta ad activity of a whole list of companies in parallel
        </p>
      </motion.div>

      {/* Wizard card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.05 }}
        className="rounded-xl border border-border/60 bg-card/40 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border/50">
          <Stepper step={step} maxReached={maxReached} onJump={(n) => { setStepDir(n > step ? 1 : -1); setStep(n); }} />
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait" custom={stepDir}>
            {/* STEP 1 — COMPANIES */}
            {step === 1 && (
              <motion.div
                key="step1"
                custom={stepDir}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Upload your companies</h3>
                  <p className="text-xs text-muted-foreground">
                    Upload a CSV of companies with their website domains. Duplicates are removed automatically.
                  </p>
                </div>

                {/* Match mode — determines which columns are required */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Match each company by</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setMatchPages(true)}
                      className={cn('rounded-lg border p-3 text-left transition-colors', matchPages ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50')}
                    >
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <Building2 className="w-3.5 h-3.5" /> Brand page
                        {matchPages && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Reads each brand&apos;s social handle from its website and matches the exact advertiser page. Needs a Website column.</p>
                    </button>
                    <button
                      onClick={() => setMatchPages(false)}
                      className={cn('rounded-lg border p-3 text-left transition-colors', !matchPages ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50')}
                    >
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <Target className="w-3.5 h-3.5" /> Keyword
                        {!matchPages && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Keyword search of the name across all advertisers. May include lookalikes. No website needed.</p>
                    </button>
                  </div>
                </div>

                {/* How deterministic matching works */}
                {matchPages && (
                  <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                      <Info className="w-3 h-3 text-primary" /> How brand-page matching works
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                      For each company we open its <span className="font-medium text-foreground/90">website</span>, read the Facebook/Instagram handle it links to, and match that exact handle against Meta&apos;s advertiser pages. It&apos;s an identity match, not a name guess. A company we can&apos;t verify this way is flagged <span className="font-medium">Needs review</span> rather than scraped as the wrong brand.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Label className="text-xs">Company CSV</Label>
                  {fileName && (
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="h-7 text-xs">
                      <Upload className="w-3.5 h-3.5 mr-1" /> Replace
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
                </div>

                {!fileName ? (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors py-8 flex flex-col items-center gap-2 text-center"
                  >
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Upload a CSV</span>
                    <span className="text-[11px] text-muted-foreground">
                      Company name{matchPages ? ' + Website columns required' : ' column required'}
                    </span>
                  </button>
                ) : (
                  <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
                    <div className="px-3 py-2.5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{fileName}</p>
                        <p className="text-xs text-muted-foreground">{rawRows.length.toLocaleString()} rows parsed</p>
                      </div>
                      <button onClick={clearList} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>

                    {columns.length > 0 && (
                      <div className="border-t border-border/40 bg-background/40 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-2">
                          <Columns3 className="w-3 h-3" /> Map columns
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Company name <span className="text-primary">*</span></Label>
                            <Select value={companyCol} onValueChange={(v) => v && setCompanyCol(v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select column" /></SelectTrigger>
                              <SelectContent>
                                {columns.map((col) => <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Website / domain {needsWebsite && <span className="text-primary">*</span>}</Label>
                            <Select value={websiteCol} onValueChange={(v) => v && setWebsiteCol(v)}>
                              <SelectTrigger className={cn('h-8 text-xs', needsWebsite && !websiteMapped && 'border-red-500/60')}><SelectValue placeholder="Select column" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_COLUMN} className="text-xs">None</SelectItem>
                                {columns.map((col) => <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Category / industry (optional)</Label>
                            <Select value={categoryCol} onValueChange={(v) => v && setCategoryCol(v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_COLUMN} className="text-xs">None</SelectItem>
                                {columns.map((col) => <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Page URL / ID (advanced)</Label>
                            <Select value={pageCol} onValueChange={(v) => v && setPageCol(v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_COLUMN} className="text-xs">None</SelectItem>
                                {columns.map((col) => <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {needsWebsite && !websiteMapped && (
                          <p className="text-[11px] text-red-400 mt-2">
                            Brand-page matching needs a Website column. Map it above, or switch to Keyword matching.
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-2 leading-relaxed">
                          <span className="font-medium text-foreground/90">Page URL / ID</span> is an optional advanced override: paste a brand&apos;s Ad Library link to pin the exact page and skip the handle lookup. <span className="font-medium">Category</span> is rarely needed.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {companies.length > 0 && (
                  <CompanyPreview companies={companies} dupes={dupes} onClear={clearList} />
                )}
              </motion.div>
            )}

            {/* STEP 2 — TARGETING */}
            {step === 2 && (
              <motion.div
                key="step2"
                custom={stepDir}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                className="space-y-5"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Targeting</h3>
                  <p className="text-xs text-muted-foreground">Which market to look up brands in, and which ads count.</p>
                </div>

                {matchPages && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Look up brands in</Label>
                    <CountryCombobox value={matchCountry} onChange={setMatchCountry} placeholder="United States" />
                    <p className="text-[11px] text-muted-foreground/70">
                      The market we search Meta in when resolving each brand&apos;s page.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Ad status</Label>
                  <div className="flex gap-1.5">
                    {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setScopeStatus(s)}
                        className={cn('px-3 py-1.5 rounded-md text-xs border transition-colors', scopeStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
                      >
                        {s === 'ALL' ? 'Both' : s === 'ACTIVE' ? 'Active only' : 'Inactive only'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Media types {scopeMedia.length === 0 && <span className="text-muted-foreground/50">(all)</span>}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {MEDIA_OPTS.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setScopeMedia((prev) => toggle(prev, m.value))}
                        className={cn('px-2.5 py-1 rounded-md text-xs border transition-colors', scopeMedia.includes(m.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Platforms {scopePlatforms.length === 0 && <span className="text-muted-foreground/50">(all)</span>}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORM_OPTS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setScopePlatforms((prev) => toggle(prev, p.value))}
                        className={cn('px-2.5 py-1 rounded-md text-xs border transition-colors', scopePlatforms.includes(p.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3 — RUN */}
            {step === 3 && (
              <motion.div
                key="step3"
                custom={stepDir}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18 }}
                className="space-y-5"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Run settings</h3>
                  <p className="text-xs text-muted-foreground">Name the job, tune speed, then review and launch.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Job name (optional)</Label>
                  <Input placeholder="e.g. Prospect list June 2026" value={jobName} onChange={(e) => setJobName(e.target.value)} className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Parallel workers</Label>
                    <span className="text-xs font-semibold tabular-nums text-foreground">{workers}</span>
                  </div>
                  <input
                    type="range" min={1} max={10} step={1} value={workers}
                    onChange={(e) => changeWorkers(Number(e.target.value))}
                    className="w-full h-1.5 accent-primary cursor-pointer"
                  />
                  <p className="text-[11px] text-muted-foreground/70">
                    Companies scraped at once. Higher = faster but raises the chance Meta rate-limits you; 4–6 is the safe sweet spot. Saved for next time.
                  </p>
                </div>

                <button onClick={() => setFetchDetails((v) => !v)} className="flex items-center gap-2 w-full text-left">
                  <span className={cn('relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors', fetchDetails ? 'bg-primary' : 'bg-muted-foreground/30')}>
                    <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform', fetchDetails ? 'translate-x-3.5' : 'translate-x-0.5')} />
                  </span>
                  <span className="text-xs">
                    <span className="font-medium">Fetch ad details</span>
                    <span className="text-muted-foreground"> — pull EU transparency data (reach, demographics) per ad. Slower.</span>
                  </span>
                </button>
                {fetchDetails && (
                  <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5 leading-relaxed">
                    Reach &amp; demographics only exist for advertisers running ads in the EU (EU transparency law). Non-EU advertisers return blank details — a Meta limitation, not a failed scrape.
                  </p>
                )}

                {/* Webhook — optional real-time push per completed company */}
                <div className="space-y-2.5">
                  <button onClick={() => setWebhookEnabled((v) => !v)} className="flex items-center gap-2 w-full text-left">
                    <span className={cn('relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors', webhookEnabled ? 'bg-primary' : 'bg-muted-foreground/30')}>
                      <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform', webhookEnabled ? 'translate-x-3.5' : 'translate-x-0.5')} />
                    </span>
                    <span className="text-xs">
                      <span className="font-medium">Send to webhook</span>
                      <span className="text-muted-foreground"> — POST each company&apos;s summary + its ads in real time as it finishes.</span>
                    </span>
                  </button>
                  {webhookEnabled && (
                    <div className="space-y-2 pl-9">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Webhook URL <span className="text-primary">*</span></Label>
                        <Input
                          placeholder="https://example.com/hooks/meta-ads"
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Signing secret (optional)</Label>
                        <Input
                          placeholder="Used to sign payloads (X-Webhook-Signature)"
                          value={webhookSecret}
                          onChange={(e) => setWebhookSecret(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <WebhookTester url={webhookUrl} secret={webhookSecret} source="bulk" />
                      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                        Fires <span className="font-mono text-foreground/80">bulk.company_done</span> per company. Delivery is non-blocking — a failing webhook never slows or stops the scrape. Send a test first to confirm the URL is reachable.
                      </p>
                    </div>
                  )}
                </div>

                {/* Review */}
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3.5 space-y-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Review</p>
                  <SummaryRow icon={Building2} label="Companies" value={`${companies.length.toLocaleString()} unique${dupes > 0 ? ` · ${dupes.toLocaleString()} dupes removed` : ''}`} />
                  <SummaryRow icon={matchPages ? Building2 : Target} label="Match by" value={matchPages ? 'Brand page' : 'Keyword'} />
                  {matchPages && <SummaryRow icon={Globe} label="Look up in" value={matchCountry} />}
                  <SummaryRow icon={Target} label="Scope" value={`${scopeStatus === 'ALL' ? 'Active + inactive' : scopeStatus === 'ACTIVE' ? 'Active only' : 'Inactive only'} · ${scopeMedia.length ? scopeMedia.length + ' media' : 'all media'} · ${scopePlatforms.length ? scopePlatforms.length + ' platforms' : 'all platforms'}`} />
                  <SummaryRow icon={Rocket} label="Speed" value={`${workers} parallel ${workers === 1 ? 'worker' : 'workers'}`} />
                  <SummaryRow icon={Tag} label="Ad details" value={fetchDetails ? 'Fetched per ad' : 'Skipped (faster)'} />
                  <SummaryRow icon={Rocket} label="Webhook" value={webhookEnabled && webhookUrl.trim() ? `On · ${webhookUrl.trim()}` : 'Off'} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="px-5 py-3.5 border-t border-border/50 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button variant="ghost" size="sm" onClick={back} className="text-muted-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          ) : <span />}

          {step < 3 ? (
            <Button
              size="sm"
              onClick={next}
              disabled={step === 1 && (companies.length === 0 || (needsWebsite && !websiteMapped))}
            >
              {step === 1 ? `Next: Targeting` : 'Next: Run settings'} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={companies.length === 0 || (needsWebsite && !websiteMapped) || loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Starting…</> : <><Play className="w-4 h-4 mr-1.5" />Start scrape ({companies.length.toLocaleString()})</>}
            </Button>
          )}
        </div>
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
