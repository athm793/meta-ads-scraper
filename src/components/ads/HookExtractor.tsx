'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Ad } from '@/types/ads';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface HookExtractorProps {
  open: boolean;
  onClose: () => void;
  ads: Ad[];
}

export function HookExtractor({ open, onClose, ads }: HookExtractorProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const hooks = ads
    .map((ad) => {
      const body = ad.body_variants[0];
      if (!body) return null;
      const firstLine = body.split('\n')[0].trim().slice(0, 200);
      return { id: ad.id, advertiser: ad.advertiser_name, hook: firstLine };
    })
    .filter(Boolean) as { id: string; advertiser: string; hook: string }[];

  function copyHook(id: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  function copyAll() {
    navigator.clipboard.writeText(hooks.map((h) => h.hook).join('\n\n')).catch(() => {});
    setCopied('all');
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[480px]">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Hook Extractor</SheetTitle>
            <Button size="sm" variant="outline" onClick={copyAll}>
              {copied === 'all' ? <Check className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              Copy All ({hooks.length})
            </Button>
          </div>
        </SheetHeader>
        <p className="text-xs text-muted-foreground mt-1 mb-4">First line of every ad in current results</p>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="space-y-2">
            {hooks.map((h) => (
              <div key={h.id} className="group flex items-start gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">{h.advertiser}</p>
                  <p className="text-sm leading-relaxed">{h.hook}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={() => copyHook(h.id, h.hook)}>
                  {copied === h.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            ))}
            {hooks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No ads with copy loaded yet</p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
