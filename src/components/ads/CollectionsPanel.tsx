'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Collection } from '@/types/ads';
import { Plus, Trash2 } from 'lucide-react';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

interface CollectionsPanelProps {
  open: boolean;
  onClose: () => void;
  collections: Collection[];
  onCreate: (name: string, color: string) => void;
  onDelete: (id: string) => void;
}

export function CollectionsPanel({ open, onClose, collections, onCreate, onDelete }: CollectionsPanelProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  function handleCreate() {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName('');
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Collections</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <Input
              placeholder="Collection name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-current' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button onClick={handleCreate} className="w-full" size="sm">
              <Plus className="w-4 h-4 mr-1" /> Create Collection
            </Button>
          </div>

          <div className="space-y-2">
            {collections.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color || '#6366f1' }} />
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.ad_count != null && <span className="text-xs text-muted-foreground">({c.ad_count})</span>}
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            {collections.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No collections yet</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
