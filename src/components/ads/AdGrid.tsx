'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { Ad } from '@/types/ads';
import { AdCard } from './AdCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

interface AdGridProps {
  ads: Ad[];
  loading: boolean;
  hasSearched: boolean;
  onAdClick: (ad: Ad) => void;
  onSave: (id: string, saved: boolean) => void;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <Skeleton className="w-full aspect-video" />
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex gap-1 pt-0.5">
          <Skeleton className="h-4 w-6 rounded" />
          <Skeleton className="h-4 w-6 rounded" />
        </div>
      </div>
    </div>
  );
}

export function AdGrid({ ads, loading, hasSearched, onAdClick, onSave }: AdGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (hasSearched && ads.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Search className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No ads found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Try different keywords or broaden your filters</p>
      </motion.div>
    );
  }

  if (!hasSearched) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Search className="w-6 h-6 text-primary/60" />
        </div>
        <p className="text-sm font-medium">Search the Meta Ads Library</p>
        <p className="text-xs text-muted-foreground mt-1">Enter a keyword or advertiser name to get started</p>
      </motion.div>
    );
  }

  return (
    <AnimatePresence mode="sync">
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        layout
      >
        {ads.map((ad, i) => (
          <AdCard
            key={ad.id}
            ad={ad}
            index={i}
            onClick={() => onAdClick(ad)}
            onSave={onSave}
          />
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
