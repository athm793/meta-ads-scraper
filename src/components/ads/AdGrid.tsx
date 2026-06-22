'use client';

import type { Ad } from '@/types/ads';
import { AdCard } from './AdCard';
import { Skeleton } from '@/components/ui/skeleton';

interface AdGridProps {
  ads: Ad[];
  loading?: boolean;
  hasSearched?: boolean;
  onAdClick: (ad: Ad) => void;
  onSave: (id: string, saved: boolean) => void;
}

export function AdGrid({ ads, loading, hasSearched, onAdClick, onSave }: AdGridProps) {
  if (loading && ads.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (!loading && ads.length === 0 && hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-lg font-medium text-muted-foreground">No ads found</p>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
      </div>
    );
  }

  if (!loading && ads.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} onClick={() => onAdClick(ad)} onSave={onSave} />
      ))}
    </div>
  );
}
