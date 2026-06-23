'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import type { Ad } from '@/types/ads';
import { adToHook, ANGLES, ANGLE_LABEL, ANGLE_COLOR, type HookRecord } from '@/lib/hooks';
import { Copy, Check, Search, Download, Layers, List, BarChart3, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';

interface HookExtractorProps {
  open: boolean;
  onClose: () => void;
  ads: Ad[];
  onSelectAd?: (id: string) => void;
}

type View = 'hooks' | 'stats' | 'trends';

function AngleBadge({ angle }: { angle: string }) {
  const c = ANGLE_COLOR[angle] || '#94a3b8';
  return (
    <span className="inline-flex items-center h-4 px-1.5 rounded text-[10px] font-medium border" style={{ borderColor: c + '55', background: c + '1f', color: c }}>
      {ANGLE_LABEL[angle] || angle}
    </span>
  );
}

export function HookExtractor({ open, onClose, ads, onSelectAd }: HookExtractorProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('hooks');
  const [unique, setUnique] = useState(true);
  const [angleFilter, setAngleFilter] = useState<string | null>(null);

  const records = useMemo<HookRecord[]>(() => ads.map(adToHook).filter(Boolean) as HookRecord[], [ads]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (!angleFilter || r.angles.includes(angleFilter)) &&
          (!q || r.hook.toLowerCase().includes(q) || r.advertiser.toLowerCase().includes(q) || (r.headline || '').toLowerCase().includes(q))
      ),
    [records, q, angleFilter]
  );

  // Dedupe identical hooks, keep one record + count
  const uniqueRecords = useMemo(() => {
    const map = new Map<string, HookRecord & { count: number }>();
    for (const r of filtered) {
      const k = r.hook.toLowerCase();
      const g = map.get(k);
      if (g) g.count++;
      else map.set(k, { ...r, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);

  const list = unique ? uniqueRecords : filtered.map((r) => ({ ...r, count: 1 }));

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
    return {
      total: records.length,
      unique: new Set(records.map((r) => r.hook.toLowerCase())).size,
      avgLen: records.length ? Math.round(totalLen / records.length) : 0,
      angleStats,
      topCtas: top(ctas, 8),
      media: top(media, 6),
      topAdvertisers: top(advertisers, 8),
    };
  }, [records]);

  // ---- Trends ----
  const { data: trends } = useQuery<{ periods: { week: string; total: number; angles: Record<string, number> }[]; deltas: Record<string, number> }>({
    queryKey: ['hook-trends'],
    queryFn: () => fetch('/api/hooks/trends').then((r) => r.json()),
    enabled: open && view === 'trends',
  });

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
      ['Hook', 'Angles', 'Headline', 'CTA', 'Advertiser', 'Media', 'Status', 'Days Running', 'Count'],
      ...list.map((r) => [r.hook, r.angles.map((a) => ANGLE_LABEL[a]).join(' / '), r.headline || '', r.cta || '', r.advertiser, r.mediaType, r.status, String(r.daysRunning ?? ''), String(r.count)]),
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
          <SheetTitle>Hook Lab</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {records.length.toLocaleString()} {records.length === 1 ? 'hook' : 'hooks'} across {advertiserCount.toLocaleString()} {advertiserCount === 1 ? 'advertiser' : 'advertisers'}
          </p>
        </SheetHeader>

        {/* Sticky controls: view tabs + (hooks) search/filters */}
        <div className="px-5 pt-3 pb-3.5 space-y-3 border-b border-border/50 shrink-0">
          <div className="flex p-0.5 gap-0.5 rounded-lg bg-muted/40 border border-border/40">
            {([['hooks', 'Swipe file', List], ['stats', 'Stats', BarChart3], ['trends', 'Trends', TrendingUp]] as const).map(([v, label, Icon]) => (
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
                {[['Hooks', stats.total], ['Unique', stats.unique], ['Avg chars', stats.avgLen]].map(([l, v]) => (
                  <div key={l} className="border border-border/60 rounded-lg p-2.5 text-center">
                    <p className="text-xl font-bold tabular-nums">{Number(v).toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground">{l}</p>
                  </div>
                ))}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Most active advertisers</p>
                <div className="space-y-1">
                  {stats.topAdvertisers.map(([adv, n]) => (
                    <div key={adv} className="flex items-center justify-between text-xs">
                      <span className="truncate">{adv}</span>
                      <span className="text-muted-foreground tabular-nums">{n} ads</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        {/* ---------- TRENDS ---------- */}
        {view === 'trends' && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-6">
              <p className="text-[11px] text-muted-foreground">
                Which hook angles are trending up or down — comparing the most recent week of scraped ads to the week before, grouped by each ad&apos;s launch date.
              </p>
              {!trends || trends.periods.length < 2 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Need ads spanning at least two weeks to show trends. Keep scraping over time.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {ANGLES.filter((a) => (trends.deltas[a.key] ?? 0) !== 0).sort((a, b) => Math.abs(trends.deltas[b.key]) - Math.abs(trends.deltas[a.key])).map((a) => {
                      const d = trends.deltas[a.key] ?? 0;
                      const up = d > 0;
                      return (
                        <div key={a.key} className="flex items-center justify-between p-2.5 rounded-lg border border-border/60">
                          <span className="flex items-center gap-2 text-sm"><span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />{a.label}</span>
                          <span className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                            {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {up ? '+' : ''}{d}%
                          </span>
                        </div>
                      );
                    })}
                    {ANGLES.every((a) => (trends.deltas[a.key] ?? 0) === 0) && (
                      <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground py-4"><Minus className="w-4 h-4" /> No change between the last two weeks</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Weekly volume</p>
                    <div className="space-y-1">
                      {trends.periods.slice(-8).map((p) => (
                        <div key={p.week} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{p.week}</span>
                          <span className="tabular-nums">{p.total} ads</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
