'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Ad } from '@/types/ads';
import { adToHook, ANGLES, ANGLE_LABEL, ANGLE_COLOR, TREND_STAGES, STAGE_COLOR, STAGE_LABEL, type HookRecord, type TrendStage } from '@/lib/hooks';
import { Copy, Check, Search, Download, Layers, List, BarChart3, Gauge, ArrowRight, Flame, Clock, SortDesc } from 'lucide-react';
import { useMemo, useState } from 'react';

interface HookExtractorProps {
  open: boolean;
  onClose: () => void;
  ads: Ad[];
  onSelectAd?: (id: string) => void;
  contextLabel?: string; // e.g. "List: Winners" / "Session: Competitor sweep"
}

type View = 'hooks' | 'stats' | 'durability';

function AngleBadge({ angle }: { angle: string }) {
  const c = ANGLE_COLOR[angle] || '#94a3b8';
  return (
    <span className="inline-flex items-center h-4 px-1.5 rounded text-[10px] font-medium border" style={{ borderColor: c + '55', background: c + '1f', color: c }}>
      {ANGLE_LABEL[angle] || angle}
    </span>
  );
}

function StageBadge({ stage, days }: { stage: TrendStage; days: number | null }) {
  if (stage === 'unknown') return null;
  const c = STAGE_COLOR[stage];
  return (
    <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded text-[10px] font-semibold border" style={{ borderColor: c + '66', background: c + '22', color: c }}>
      {stage === 'battle_tested' && <Flame className="w-2.5 h-2.5" />}
      {STAGE_LABEL[stage]}{days != null ? ` · ${days}d` : ''}
    </span>
  );
}

export function HookExtractor({ open, onClose, ads, onSelectAd, contextLabel }: HookExtractorProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('hooks');
  const [unique, setUnique] = useState(true);
  const [angleFilter, setAngleFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<TrendStage | null>(null);
  const [sortMode, setSortMode] = useState<'top' | 'longest'>('top');

  const records = useMemo<HookRecord[]>(() => ads.map(adToHook).filter(Boolean) as HookRecord[], [ads]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (!angleFilter || r.angles.includes(angleFilter)) &&
          (!stageFilter || r.stage === stageFilter) &&
          (!q || r.hook.toLowerCase().includes(q) || r.advertiser.toLowerCase().includes(q) || (r.headline || '').toLowerCase().includes(q))
      ),
    [records, q, angleFilter, stageFilter]
  );

  // Dedupe identical hooks: keep the longest-running instance as the representative
  // (so the stage badge reflects the battle-tested version), plus a run count.
  const uniqueRecords = useMemo(() => {
    const map = new Map<string, HookRecord & { count: number }>();
    for (const r of filtered) {
      const k = r.hook.toLowerCase();
      const g = map.get(k);
      if (g) {
        g.count++;
        if ((r.ageDays ?? -1) > (g.ageDays ?? -1)) { const c = g.count; Object.assign(g, r); g.count = c; }
      } else {
        map.set(k, { ...r, count: 1 });
      }
    }
    return [...map.values()];
  }, [filtered]);

  const list = useMemo(() => {
    const base = unique ? uniqueRecords : filtered.map((r) => ({ ...r, count: 1 }));
    const sorted = [...base];
    if (sortMode === 'longest') sorted.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));
    else sorted.sort((a, b) => b.count - a.count || (b.ageDays ?? -1) - (a.ageDays ?? -1));
    return sorted;
  }, [unique, uniqueRecords, filtered, sortMode]);

  // ---- Stats ----
  const stats = useMemo(() => {
    const byAngle = new Map<string, { count: number; advertisers: Set<string>; days: number[] }>();
    const ctas = new Map<string, number>();
    const media = new Map<string, number>();
    const advertisers = new Map<string, number>();
    let totalLen = 0;
    for (const r of records) {
      for (const a of r.angles) {
        const g = byAngle.get(a) ?? { count: 0, advertisers: new Set(), days: [] };
        g.count++;
        g.advertisers.add(r.advertiser);
        if (r.daysRunning != null) g.days.push(r.daysRunning);
        byAngle.set(a, g);
      }
      if (r.cta) ctas.set(r.cta, (ctas.get(r.cta) || 0) + 1);
      media.set(r.mediaType, (media.get(r.mediaType) || 0) + 1);
      advertisers.set(r.advertiser, (advertisers.get(r.advertiser) || 0) + 1);
      totalLen += r.hook.length;
    }
    const angleStats = ANGLES.map((a) => {
      const g = byAngle.get(a.key);
      const days = g?.days ?? [];
      return {
        ...a,
        count: g?.count ?? 0,
        advertisers: g?.advertisers.size ?? 0,
        avgDays: days.length ? Math.round(days.reduce((s, n) => s + n, 0) / days.length) : null,
      };
    }).filter((a) => a.count > 0).sort((a, b) => b.count - a.count);
    const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

    // Trend stages (duration-based) — the "creative viability" signal
    const stageCounts: Record<TrendStage, number> = { battle_tested: 0, gaining: 0, new: 0, unknown: 0 };
    const ages: number[] = [];
    let active = 0;
    let longest: HookRecord | null = null;
    // Per-advertiser stage mix — who has proven (long-running) creative vs who's testing
    const advStages = new Map<string, { battle: number; gaining: number; neu: number }>();
    for (const r of records) {
      stageCounts[r.stage]++;
      if (r.ageDays != null) ages.push(r.ageDays);
      if (r.status === 'ACTIVE') active++;
      if (r.ageDays != null && (longest == null || r.ageDays > (longest.ageDays ?? -1))) longest = r;
      const as = advStages.get(r.advertiser) ?? { battle: 0, gaining: 0, neu: 0 };
      if (r.stage === 'battle_tested') as.battle++; else if (r.stage === 'gaining') as.gaining++; else if (r.stage === 'new') as.neu++;
      advStages.set(r.advertiser, as);
    }
    const avgAge = ages.length ? Math.round(ages.reduce((s, n) => s + n, 0) / ages.length) : null;

    return {
      total: records.length,
      active,
      unique: new Set(records.map((r) => r.hook.toLowerCase())).size,
      avgLen: records.length ? Math.round(totalLen / records.length) : 0,
      angleStats,
      topCtas: top(ctas, 8),
      media: top(media, 6),
      topAdvertisers: top(advertisers, 8),
      advStages,
      stageCounts,
      avgAge,
      longest,
    };
  }, [records]);

  // ---- Angle durability: which angles have staying power (cross-section of this set) ----
  const durability = useMemo(() => {
    return ANGLES.map((a) => {
      let battle = 0, gaining = 0, neu = 0, unknown = 0;
      for (const r of records) {
        if (!r.angles.includes(a.key)) continue;
        if (r.stage === 'battle_tested') battle++;
        else if (r.stage === 'gaining') gaining++;
        else if (r.stage === 'new') neu++;
        else unknown++;
      }
      const total = battle + gaining + neu + unknown;
      const known = battle + gaining + neu;
      return { ...a, total, known, battle, gaining, neu, battleShare: known ? battle / known : 0 };
    }).filter((a) => a.total > 0).sort((a, b) => b.battleShare - a.battleShare || b.total - a.total);
  }, [records]);

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }
  function copyAll() {
    copy('all', list.map((r) => r.hook).join('\n\n'));
  }
  function exportCsv() {
    const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Hook', 'Angles', 'Trend stage', 'Ad age (days)', 'Headline', 'CTA', 'Advertiser', 'Media', 'Status', 'Days Running', 'Count'],
      ...list.map((r) => [r.hook, r.angles.map((a) => ANGLE_LABEL[a]).join(' / '), STAGE_LABEL[r.stage], String(r.ageDays ?? ''), r.headline || '', r.cta || '', r.advertiser, r.mediaType, r.status, String(r.daysRunning ?? ''), String(r.count)]),
    ];
    const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hooks-swipe-file.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const maxAngle = Math.max(1, ...stats.angleStats.map((a) => a.count));
  const advertiserCount = useMemo(() => new Set(records.map((r) => r.advertiser)).size, [records]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[560px] max-w-[96vw] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <SheetTitle className="flex items-center gap-2">
            Hook Lab
            {contextLabel && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">{contextLabel}</span>
            )}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {records.length.toLocaleString()} {records.length === 1 ? 'hook' : 'hooks'} across {advertiserCount.toLocaleString()} {advertiserCount === 1 ? 'advertiser' : 'advertisers'}
          </p>
        </SheetHeader>

        {/* Sticky controls: view tabs + (hooks) search/filters */}
        <div className="px-5 pt-3 pb-3.5 space-y-3 border-b border-border/50 shrink-0">
          <div className="flex p-0.5 gap-0.5 rounded-lg bg-muted/40 border border-border/40">
            {([['hooks', 'Swipe file', List], ['stats', 'Stats', BarChart3], ['durability', 'Durability', Gauge]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 h-7 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${view === v ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {view === 'hooks' && (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Search hooks, headlines, advertisers..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8 text-xs" />
                </div>
                <button
                  onClick={() => setUnique((u) => !u)}
                  className={`h-8 px-2.5 rounded-md text-xs border flex items-center gap-1.5 transition-colors shrink-0 ${unique ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  title="Collapse identical hooks"
                >
                  <Layers className="w-3.5 h-3.5" /> Unique
                </button>
              </div>

              {/* Angle filter chips */}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setAngleFilter(null)} className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${!angleFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  All
                </button>
                {stats.angleStats.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setAngleFilter(angleFilter === a.key ? null : a.key)}
                    className="px-2 h-6 rounded-full text-[11px] border transition-colors flex items-center gap-1"
                    style={angleFilter === a.key ? { background: a.color, borderColor: a.color, color: '#fff' } : { borderColor: a.color + '55', color: a.color }}
                  >
                    {a.label} <span className="opacity-70">{a.count}</span>
                  </button>
                ))}
              </div>

              {/* Trend-stage chips (duration) + longest-running sort */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setStageFilter(null)} className={`px-2 h-6 rounded-full text-[11px] border transition-colors ${!stageFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  All ages
                </button>
                {TREND_STAGES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStageFilter(stageFilter === s.key ? null : s.key)}
                    className="px-2 h-6 rounded-full text-[11px] border transition-colors flex items-center gap-1"
                    style={stageFilter === s.key ? { background: s.color, borderColor: s.color, color: '#fff' } : { borderColor: s.color + '55', color: s.color }}
                    title={`${s.label} (${s.short})`}
                  >
                    {s.key === 'battle_tested' && <Flame className="w-3 h-3" />}
                    {s.label} <span className="opacity-70">{stats.stageCounts[s.key]}</span>
                  </button>
                ))}
                <button
                  onClick={() => setSortMode((m) => (m === 'longest' ? 'top' : 'longest'))}
                  className={`ml-auto h-6 px-2 rounded-md text-[11px] border flex items-center gap-1 transition-colors ${sortMode === 'longest' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  title="Sort by longest-running (most battle-tested first)"
                >
                  {sortMode === 'longest' ? <SortDesc className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />} Longest
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={copyAll} disabled={list.length === 0}>
                  {copied === 'all' ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />} Copy all ({list.length})
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={exportCsv} disabled={list.length === 0}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ---------- HOOKS ---------- */}
        {view === 'hooks' && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-2.5">
              {list.map((r, i) => (
                <div key={r.id + i} className="group rounded-lg border bg-card hover:bg-muted/50 transition-colors p-3.5">
                  <div className="flex items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <StageBadge stage={r.stage} days={r.ageDays} />
                        {r.angles.map((a) => <AngleBadge key={a} angle={a} />)}
                        {r.count > 1 && <span className="text-[10px] text-primary font-semibold">×{r.count}</span>}
                      </div>
                      <p className="text-sm leading-relaxed">{r.hook}</p>
                      {r.headline && <p className="text-xs text-muted-foreground mt-1.5 truncate">📰 {r.headline}</p>}
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                        <span className="truncate max-w-[160px]">{r.advertiser}</span>
                        {r.cta && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{r.cta}</Badge>}
                        {r.daysRunning != null && <span>{r.daysRunning}d</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => copy(r.id + i, r.hook)} title="Copy hook">
                        {copied === r.id + i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                      {onSelectAd && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => onSelectAd(r.id)} title="View ad">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {list.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {records.length === 0 ? 'No ads with copy loaded yet' : 'No hooks match your filters'}
                </p>
              )}
            </div>
          </ScrollArea>
        )}

        {/* ---------- STATS ---------- */}
        {view === 'stats' && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-6">
              <div className="grid grid-cols-3 gap-2">
                {[['Hooks', stats.total], ['Active', stats.active], ['Avg age', stats.avgAge != null ? `${stats.avgAge}d` : '—']].map(([l, v]) => (
                  <div key={l} className="border border-border/60 rounded-lg p-2.5 text-center">
                    <p className="text-xl font-bold tabular-nums">{typeof v === 'number' ? v.toLocaleString() : v}</p>
                    <p className="text-[11px] text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>

              {/* Trend stages — duration-based creative viability */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Trend stages</p>
                <div className="space-y-2">
                  {TREND_STAGES.map((s) => {
                    const count = stats.stageCounts[s.key];
                    const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={s.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            {s.key === 'battle_tested' ? <Flame className="w-3 h-3" style={{ color: s.color }} /> : <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />}
                            {s.label} <span className="text-muted-foreground">({s.short})</span>
                          </span>
                          <span className="text-muted-foreground tabular-nums">{count} · {pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {stats.longest && stats.longest.ageDays != null && (
                  <button
                    onClick={() => onSelectAd?.(stats.longest!.id)}
                    className="mt-3 w-full text-left rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-2.5 hover:bg-emerald-500/10 transition-colors"
                    title="View this ad"
                  >
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                      <Flame className="w-3 h-3" /> Longest-running ad · {stats.longest.ageDays}d
                    </p>
                    <p className="text-xs mt-1 line-clamp-2">{stats.longest.hook}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">{stats.longest.advertiser}</p>
                  </button>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Angle distribution</p>
                <div className="space-y-2">
                  {stats.angleStats.map((a) => (
                    <div key={a.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: a.color }} />{a.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {a.count} · {a.advertisers} advs{a.avgDays != null ? ` · ~${a.avgDays}d avg` : ''}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(a.count / maxAngle) * 100}%`, background: a.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Top CTAs</p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.topCtas.map(([cta, n]) => (
                    <Badge key={cta} variant="outline" className="text-xs">{cta} <span className="ml-1 text-muted-foreground">{n}</span></Badge>
                  ))}
                  {stats.topCtas.length === 0 && <span className="text-xs text-muted-foreground">No CTAs found</span>}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Media mix</p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.media.map(([m, n]) => <Badge key={m} variant="secondary" className="text-xs">{m} <span className="ml-1 text-muted-foreground">{n}</span></Badge>)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most active advertisers</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {TREND_STAGES.map((s) => (
                      <span key={s.key} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />{s.short}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {stats.topAdvertisers.map(([adv, n]) => {
                    const st = stats.advStages.get(adv) ?? { battle: 0, gaining: 0, neu: 0 };
                    const known = st.battle + st.gaining + st.neu;
                    return (
                      <div key={adv} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate">{adv}</span>
                          <span className="text-muted-foreground tabular-nums">{n} ads{st.battle > 0 ? <span className="text-emerald-400"> · {st.battle} proven</span> : ''}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
                          {known > 0 && (
                            <>
                              <div style={{ width: `${(st.battle / known) * 100}%`, background: STAGE_COLOR.battle_tested }} />
                              <div style={{ width: `${(st.gaining / known) * 100}%`, background: STAGE_COLOR.gaining }} />
                              <div style={{ width: `${(st.neu / known) * 100}%`, background: STAGE_COLOR.new }} />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        {/* ---------- DURABILITY ---------- */}
        {view === 'durability' && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-5">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Which hook angles have staying power. For each angle, the split of its ads by how long they&apos;ve run —
                a high <span style={{ color: STAGE_COLOR.battle_tested }}>battle-tested</span> share means advertisers
                keep that angle running because it works; a high <span style={{ color: STAGE_COLOR.new }}>new test</span>{' '}
                share means it&apos;s mostly unproven. A snapshot of this set, not a time trend.
              </p>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {TREND_STAGES.map((s) => (
                  <span key={s.key} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label} <span className="opacity-70">({s.short})</span>
                  </span>
                ))}
              </div>

              <div className="space-y-3">
                {durability.map((a) => (
                  <div key={a.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: a.color }} />{a.label}</span>
                      <span className="tabular-nums">
                        <span style={{ color: STAGE_COLOR.battle_tested }}>{Math.round(a.battleShare * 100)}% battle-tested</span>
                        <span className="text-muted-foreground"> · {a.total} ad{a.total === 1 ? '' : 's'}</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                      {a.known > 0 && (
                        <>
                          <div style={{ width: `${(a.battle / a.known) * 100}%`, background: STAGE_COLOR.battle_tested }} title={`${a.battle} battle-tested`} />
                          <div style={{ width: `${(a.gaining / a.known) * 100}%`, background: STAGE_COLOR.gaining }} title={`${a.gaining} gaining`} />
                          <div style={{ width: `${(a.neu / a.known) * 100}%`, background: STAGE_COLOR.new }} title={`${a.neu} new`} />
                        </>
                      )}
                    </div>
                    {a.known === 0 && <p className="text-[10px] text-muted-foreground">No dated ads for this angle</p>}
                  </div>
                ))}
                {durability.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No hooks loaded</p>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
