'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import type { AdvertiserSuggestion } from '@/types/ads';
import { Users, Loader2, BadgeCheck, AlertTriangle } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  country: string;
  onSelect: (s: AdvertiserSuggestion) => void;
  onEnter: () => void;
}

function compact(n?: number): string {
  if (n == null) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function AdvertiserSearch({ value, onChange, country, onSelect, onEnter }: Props) {
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 450);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = debounced.trim();
  const { data: suggestions = [], isFetching, error } = useQuery<AdvertiserSuggestion[]>({
    queryKey: ['advertisers', q, country],
    queryFn: async () => {
      const r = await fetch(`/api/advertisers?q=${encodeURIComponent(q)}&country=${country || 'US'}`);
      const data = await r.json();
      if (!r.ok) {
        // Surface Meta-API-changed (503) as a thrown error so we can warn loudly.
        const err = new Error(data?.error || `Request failed (${r.status})`) as Error & { code?: string };
        err.code = data?.code;
        throw err;
      }
      return data as AdvertiserSuggestion[];
    },
    enabled: open && q.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const list = Array.isArray(suggestions) ? suggestions : [];
  const apiChanged = (error as (Error & { code?: string }) | null)?.code === 'META_API_CHANGED';

  return (
    <div ref={ref} className="flex-1 relative">
      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
      <Input
        placeholder="Advertiser / page name..."
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') { setOpen(false); onEnter(); } if (e.key === 'Escape') setOpen(false); }}
        className="pl-9"
      />

      {open && q.length >= 2 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide border-b border-border/50 flex items-center gap-1.5">
            Advertisers {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {apiChanged && (
              <div className="flex items-start gap-2 px-3 py-3 text-xs text-amber-400 bg-amber-500/10 border-b border-amber-500/20">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Meta changed their search API</p>
                  <p className="text-amber-400/80 mt-0.5">Advertiser autocomplete is temporarily unavailable. You can still run a keyword search — press Enter.</p>
                </div>
              </div>
            )}
            {!apiChanged && list.map((s) => (
              <button
                key={s.page_id}
                onClick={() => { setOpen(false); onSelect(s); }}
                className="flex items-center gap-3 w-full px-3 py-2 hover:bg-accent transition-colors text-left"
              >
                {s.image_uri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_uri} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-muted" loading="lazy" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted shrink-0 flex items-center justify-center"><Users className="w-4 h-4 text-muted-foreground" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate flex items-center gap-1">
                    {s.name}
                    {s.verified && <BadgeCheck className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[s.category, (s.likes || s.ig_followers) ? `${compact(s.likes || s.ig_followers)} followers` : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </button>
            ))}
            {!apiChanged && !isFetching && list.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No advertisers found</p>
            )}
            {!apiChanged && isFetching && list.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching advertisers…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
