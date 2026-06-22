'use client';

import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import type { MediaType, Platform } from '@/types/ads';

export interface ResultFilters {
  q: string;
  status: string;            // ALL | ACTIVE | INACTIVE
  media: MediaType[];        // empty = all
  platforms: Platform[];     // empty = all
}

export const EMPTY_RESULT_FILTERS: ResultFilters = { q: '', status: 'ALL', media: [], platforms: [] };

const MEDIA_OPTS: { value: MediaType; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'meme', label: 'Meme' },
  { value: 'multi_video', label: 'Multi-video' },
];
const PLATFORM_OPTS: { value: Platform; label: string }[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'AUDIENCE_NETWORK', label: 'Audience Net' },
  { value: 'MESSENGER', label: 'Messenger' },
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

interface Props {
  filters: ResultFilters;
  onChange: (f: Partial<ResultFilters>) => void;
  sortBy: string;
  onSortChange: (s: string) => void;
  shownCount: number;
  totalCount: number;
  newCount: number;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-md text-xs border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}
    >
      {children}
    </button>
  );
}

export function ResultsFilterBar({ filters, onChange, sortBy, onSortChange, shownCount, totalCount, newCount }: Props) {
  const dirty = filters.q !== '' || filters.status !== 'ALL' || filters.media.length > 0 || filters.platforms.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="space-y-2"
    >
      {/* Row 1: text, status, count, sort */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Filter results — advertiser, headline, copy..."
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select value={filters.status} onValueChange={(v) => v && onChange({ status: v })}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">Any status</SelectItem>
            <SelectItem value="ACTIVE" className="text-xs">Active</SelectItem>
            <SelectItem value="INACTIVE" className="text-xs">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {dirty && (
          <button
            onClick={() => onChange(EMPTY_RESULT_FILTERS)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {dirty ? `${shownCount} of ${totalCount}` : `${totalCount}`} ads
          </span>
          {newCount > 0 && (
            <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-xs">{newCount} new</Badge>
          )}
          <span className="text-xs text-muted-foreground">Sort:</span>
          <Select value={sortBy} onValueChange={(v) => v && onSortChange(v)}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scraped_at" className="text-xs">Most Recent</SelectItem>
              <SelectItem value="days_running" className="text-xs">Days Running</SelectItem>
              <SelectItem value="started_at" className="text-xs">Start Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: media + platform multi-select chips */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide mr-0.5">Media</span>
          {MEDIA_OPTS.map((m) => (
            <Chip key={m.value} active={filters.media.includes(m.value)} onClick={() => onChange({ media: toggle(filters.media, m.value) })}>
              {m.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide mr-0.5">Platform</span>
          {PLATFORM_OPTS.map((p) => (
            <Chip key={p.value} active={filters.platforms.includes(p.value)} onClick={() => onChange({ platforms: toggle(filters.platforms, p.value) })}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
