'use client';

import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';

interface ScrapeProgressProps {
  running: boolean;
  count: number;
  onStop: () => void;
}

export function ScrapeProgress({ running, count, onStop }: ScrapeProgressProps) {
  if (!running && count === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-card border border-border rounded-xl shadow-lg p-4 w-72">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {running && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          <span className="text-sm font-medium">
            {running ? 'Scraping ads...' : 'Scrape complete'}
          </span>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onStop}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="space-y-1">
        <Progress value={running ? 50 : 100} className={running ? 'animate-pulse' : ''} />
        <p className="text-xs text-muted-foreground">{count} ads found</p>
      </div>
    </div>
  );
}
