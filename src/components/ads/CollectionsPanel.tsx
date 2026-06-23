'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Collection, Tag } from '@/types/ads';
import { Plus, Trash2, FolderOpen, Tag as TagIcon, BarChart3 } from 'lucide-react';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

interface CollectionsPanelProps {
  open: boolean;
  onClose: () => void;
  collections: Collection[];
  tags: Tag[];
  onCreate: (name: string, color: string) => void;
  onDelete: (id: string) => void;
  onCreateTag: (name: string, color: string) => void;
  onDeleteTag: (id: string) => void;
  onAnalyze?: (id: string, name: string) => void; // open Hook Lab on this list's ads
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full transition-transform ${value === c ? 'scale-125 ring-2 ring-offset-2 ring-offset-background ring-current' : ''}`}
          style={{ backgroundColor: c, color: c }}
        />
      ))}
    </div>
  );
}

export function CollectionsPanel({ open, onClose, collections, tags, onCreate, onDelete, onCreateTag, onDeleteTag, onAnalyze }: CollectionsPanelProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(COLORS[1]);

  function handleCreate() {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName('');
  }
  function handleCreateTag() {
    if (!tagName.trim()) return;
    onCreateTag(tagName.trim(), tagColor);
    setTagName('');
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[440px] data-[side=right]:sm:max-w-md flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle>Lists &amp; Tags</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 pb-6 space-y-7">
            {/* Collections / Lists */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FolderOpen className="w-3.5 h-3.5" /> Lists
              </h3>
              <Input placeholder="New list name..." value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} className="h-8 text-sm" />
              <ColorPicker value={color} onChange={setColor} />
              <Button onClick={handleCreate} className="w-full" size="sm" disabled={!name.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Create list
              </Button>
              <div className="space-y-1.5">
                {collections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 border border-border/60 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color || '#6366f1' }} />
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      {c.ad_count != null && <span className="text-xs text-muted-foreground">({c.ad_count})</span>}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {onAnalyze && (c.ad_count ?? 0) > 0 && (
                        <button className="text-muted-foreground hover:text-primary p-1 transition-colors" onClick={() => onAnalyze(c.id, c.name)} title="Analyze hooks in this list">
                          <BarChart3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button className="text-muted-foreground hover:text-red-400 p-1 transition-colors" onClick={() => onDelete(c.id)} title="Delete list">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {collections.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">No lists yet</p>}
              </div>
            </section>

            {/* Tags */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <TagIcon className="w-3.5 h-3.5" /> Tags
              </h3>
              <Input placeholder="New tag name..." value={tagName} onChange={(e) => setTagName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()} className="h-8 text-sm" />
              <ColorPicker value={tagColor} onChange={setTagColor} />
              <Button onClick={handleCreateTag} className="w-full" size="sm" disabled={!tagName.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Create tag
              </Button>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="group/tag inline-flex items-center gap-1 pl-2.5 pr-1 h-7 rounded-full text-xs font-medium border"
                    style={{ borderColor: (t.color || '#6366f1') + '66', background: (t.color || '#6366f1') + '1f', color: t.color || '#a5b4fc' }}
                  >
                    {t.name}{t.ad_count != null ? ` (${t.ad_count})` : ''}
                    <button onClick={() => onDeleteTag(t.id)} className="rounded-full hover:bg-black/20 p-0.5 transition-colors" title="Delete tag">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {tags.length === 0 && <p className="text-sm text-muted-foreground text-center py-3 w-full">No tags yet — add them to ads from the ad view, or create one here.</p>}
              </div>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
