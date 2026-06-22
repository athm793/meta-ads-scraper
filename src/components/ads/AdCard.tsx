'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Ad } from '@/types/ads';
import { formatDistanceToNow } from 'date-fns';
import { Bookmark, BookmarkCheck, ExternalLink, Play, Images, Layers } from 'lucide-react';

const PLATFORM_ICONS: Record<string, string> = {
  FACEBOOK: '𝓕',
  INSTAGRAM: '📸',
  AUDIENCE_NETWORK: '🌐',
  MESSENGER: '💬',
};

interface AdCardProps {
  ad: Ad;
  onClick: () => void;
  onSave: (id: string, saved: boolean) => void;
}

export function AdCard({ ad, onClick, onSave }: AdCardProps) {
  const [saved, setSaved] = useState(ad.saved);
  const thumbUrl = ad.media_urls[0];
  const bodyPreview = ad.body_variants[0]?.slice(0, 120) || ad.headline || '(no copy)';
  const startedAgo = ad.started_at
    ? formatDistanceToNow(new Date(ad.started_at), { addSuffix: false })
    : null;

  function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !saved;
    setSaved(next);
    onSave(ad.id, next);
  }

  return (
    <Card
      className="group cursor-pointer overflow-hidden border border-border hover:border-primary/50 hover:shadow-md transition-all duration-200 bg-card"
      onClick={onClick}
    >
      {/* Creative thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {thumbUrl ? (
          ad.media_type === 'video' || ad.media_type === 'multi_video' ? (
            <>
              <img src={thumbUrl} alt="Ad creative" className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                  <Play className="w-5 h-5 text-black ml-0.5" fill="black" />
                </div>
              </div>
            </>
          ) : (
            <img src={thumbUrl} alt="Ad creative" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            No creative
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge
            variant={ad.status === 'ACTIVE' ? 'default' : 'secondary'}
            className={`text-xs ${ad.status === 'ACTIVE' ? 'bg-green-500 hover:bg-green-500' : ''}`}
          >
            {ad.status === 'ACTIVE' ? '● Active' : '○ Inactive'}
          </Badge>
          {ad.is_new && (
            <Badge className="text-xs bg-blue-500 hover:bg-blue-500">NEW</Badge>
          )}
        </div>

        {/* Media type indicator */}
        {(ad.media_type === 'carousel' || ad.media_type === 'multi_video') && (
          <div className="absolute top-2 right-2">
            <div className="bg-black/60 rounded p-1">
              {ad.media_type === 'carousel' ? <Images className="w-3.5 h-3.5 text-white" /> : <Layers className="w-3.5 h-3.5 text-white" />}
            </div>
          </div>
        )}
      </div>

      <CardContent className="p-3 space-y-2">
        {/* Advertiser */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm truncate">{ad.advertiser_name}</span>
          <div className="flex gap-0.5 text-xs text-muted-foreground">
            {ad.platforms.slice(0, 3).map((p) => (
              <span key={p} title={p}>{PLATFORM_ICONS[p] || p[0]}</span>
            ))}
          </div>
        </div>

        {/* Copy preview */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{bodyPreview}</p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {startedAgo && (
              <span className="bg-muted rounded px-1.5 py-0.5">
                {ad.days_running != null ? `${ad.days_running}d running` : `Started ${startedAgo} ago`}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleSave}
              title={saved ? 'Unsave' : 'Save'}
            >
              {saved ? <BookmarkCheck className="w-3.5 h-3.5 text-primary" /> : <Bookmark className="w-3.5 h-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); window.open(ad.ad_snapshot_url, '_blank'); }}
              title="Open in Meta Ads Library"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
