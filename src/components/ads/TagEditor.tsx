'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tag } from '@/types/ads';
import { Tag as TagIcon, Plus, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const TAG_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

interface TagEditorProps {
  adId: string;
}

export function TagEditor({ adId }: TagEditorProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [] } = useQuery<Tag[]>({ queryKey: ['tags'], queryFn: () => fetch('/api/tags').then((r) => r.json()) });
  const { data: adTags = [] } = useQuery<Tag[]>({ queryKey: ['ad-tags', adId], queryFn: () => fetch(`/api/ads/${adId}/tags`).then((r) => r.json()) });

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 40); }, [open]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['ad-tags', adId] });
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['saved-ads'] });
  }

  async function addTag(tag: Tag) {
    await fetch(`/api/ads/${adId}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_id: tag.id }) });
    refresh();
  }
  async function createAndAdd(name: string) {
    const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
    await fetch(`/api/ads/${adId}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }) });
    setQuery('');
    refresh();
  }
  async function removeTag(tag: Tag) {
    await fetch(`/api/ads/${adId}/tags`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_id: tag.id }) });
    refresh();
  }

  const adTagIds = new Set(adTags.map((t) => t.id));
  const q = query.trim().toLowerCase();
  const suggestions = allTags.filter((t) => !adTagIds.has(t.id) && (!q || t.name.toLowerCase().includes(q)));
  const exactExists = allTags.some((t) => t.name.toLowerCase() === q);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide mr-0.5">
        <TagIcon className="w-3 h-3" /> Tags
      </span>

      {adTags.map((t) => (
        <span
          key={t.id}
          className="group/tag inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-full text-xs font-medium border"
          style={{ borderColor: (t.color || '#6366f1') + '66', background: (t.color || '#6366f1') + '1f', color: t.color || '#a5b4fc' }}
        >
          {t.name}
          <button onClick={() => removeTag(t)} className="rounded-full hover:bg-black/20 p-0.5 transition-colors" title="Remove tag">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <div ref={ref} className="relative">
        <button
          onClick={() => { setOpen((o) => !o); setQuery(''); }}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add tag
        </button>

        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
            <div className="p-1.5 border-b border-border/50">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && q && !exactExists) createAndAdd(query.trim()); }}
                placeholder="Search or create tag..."
                className="w-full text-xs bg-transparent outline-none px-1 py-0.5 placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addTag(t)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color || '#6366f1' }} />
                  <span className="truncate flex-1">{t.name}</span>
                  {t.ad_count != null && <span className="text-muted-foreground/60">{t.ad_count}</span>}
                </button>
              ))}
              {q && !exactExists && (
                <button
                  onClick={() => createAndAdd(query.trim())}
                  className={cn('flex items-center gap-2 w-full px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-left', suggestions.length > 0 && 'border-t border-border/40')}
                >
                  <Plus className="w-3 h-3 shrink-0" /> Create <span className="font-medium">&ldquo;{query.trim()}&rdquo;</span>
                </button>
              )}
              {suggestions.length === 0 && !q && (
                <p className="text-[11px] text-muted-foreground/60 text-center py-2">Type to create a tag</p>
              )}
              {suggestions.length === 0 && q && exactExists && (
                <p className="text-[11px] text-muted-foreground/60 text-center py-2 flex items-center justify-center gap-1">
                  <Check className="w-3 h-3" /> Already added
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
