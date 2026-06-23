'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Ad } from '@/types/ads';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Play,
  ChevronLeft,
  ChevronRight,
  Layers,
  Video,
  ImageIcon,
  ImageDown,
  Loader2,
} from 'lucide-react';
import { downloadAdMedia, adMediaUrls } from '@/lib/downloadMedia';

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'FB',
  INSTAGRAM: 'IG',
  AUDIENCE_NETWORK: 'AN',
  MESSENGER: 'MS',
};

interface AdCardProps {
  ad: Ad;
  index?: number;
  onClick: () => void;
  onSave: (id: string, saved: boolean) => void;
}

function MediaPreview({ ad }: { ad: Ad }) {
  const [imgIdx, setImgIdx] = useState(0);
  const imgs = ad.media_urls;
  const isVideo = ad.media_type === 'video' || ad.media_type === 'multi_video';
  const isCarousel = ad.media_type === 'carousel';

  if (!imgs.length) {
    return (
      <div className="w-full aspect-video bg-muted/40 flex items-center justify-center">
        <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black/60 overflow-hidden group/media">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgs[imgIdx]}
        alt=""
        className="w-full h-full object-cover transition-transform duration-300 group-hover/media:scale-[1.02]"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
      />

      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 rounded-full p-3 backdrop-blur-sm">
            <Play className="w-6 h-6 text-white fill-white" />
          </div>
        </div>
      )}

      <div className="absolute top-2 left-2 flex gap-1">
        {isCarousel && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-xs backdrop-blur-sm">
            <Layers className="w-3 h-3" /> {imgs.length}
          </span>
        )}
        {isVideo && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-xs backdrop-blur-sm">
            <Video className="w-3 h-3" />
          </span>
        )}
      </div>

      {isCarousel && imgs.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setImgIdx((i) => Math.max(0, i - 1)); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover/media:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setImgIdx((i) => Math.min(imgs.length - 1, i + 1)); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover/media:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
            {imgs.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AdCard({ ad, index = 0, onClick, onSave }: AdCardProps) {
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const body = ad.body_variants[0] || '';
  const truncatedBody = body.length > 100 ? body.slice(0, 100) + '…' : body;
  const mediaCount = adMediaUrls(ad).length;
  // Removed/taken-down ads keep their record but lose all content.
  const isUnavailable =
    mediaCount === 0 && !ad.video_urls?.[0] && !body && !ad.headline && ad.carousel_cards.length === 0;

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    setSaving(true);
    try {
      await onSave(ad.id, !ad.saved);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadAdMedia(ad);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.5), ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className="group cursor-pointer rounded-xl border border-border/50 bg-card overflow-hidden transition-shadow hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
      onClick={onClick}
    >
      <MediaPreview ad={ad} />

      <div className="p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{ad.advertiser_name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge
                variant={ad.status === 'ACTIVE' ? 'default' : 'secondary'}
                className={`text-[10px] px-1.5 py-0 h-4 font-medium ${
                  ad.status === 'ACTIVE'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                    : 'bg-muted text-muted-foreground border-transparent'
                }`}
              >
                {ad.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </Badge>
              {ad.days_running != null && (
                <span className="text-[10px] text-muted-foreground">
                  {ad.days_running}d running
                </span>
              )}
              {isUnavailable && (
                <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-400 border-amber-500/20">
                  Unavailable
                </Badge>
              )}
            </div>
          </div>
          {ad.is_new && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 flex-shrink-0">
              NEW
            </Badge>
          )}
        </div>

        {truncatedBody && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {truncatedBody}
          </p>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1">
            {ad.platforms.slice(0, 3).map((p) => (
              <span key={p} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {PLATFORM_LABELS[p] || p}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {mediaCount > 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleDownload}
                disabled={downloading}
                title={`Download media (${mediaCount} file${mediaCount > 1 ? 's' : ''})`}
              >
                {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageDown className="w-3 h-3" />}
              </Button>
            )}
            {ad.ad_snapshot_url && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); window.open(ad.ad_snapshot_url, '_blank'); }}
                title="Open on Meta"
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className={`h-6 w-6 ${ad.saved ? 'text-primary' : ''}`}
              onClick={handleSave}
              disabled={saving}
              title={ad.saved ? 'Remove from saved' : 'Save'}
            >
              {ad.saved ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
