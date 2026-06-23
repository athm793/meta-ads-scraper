'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SearchParams, Collection } from '@/types/ads';
import { RotateCcw, FolderOpen, PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountryCombobox } from './CountryCombobox';


const LANGUAGES = [
  { code: '', name: 'All Languages' },
  { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'pt', name: 'Portuguese' }, { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' }, { code: 'pl', name: 'Polish' }, { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' }, { code: 'zh', name: 'Chinese' }, { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' }, { code: 'hi', name: 'Hindi' }, { code: 'bn', name: 'Bengali' },
  { code: 'tr', name: 'Turkish' }, { code: 'vi', name: 'Vietnamese' }, { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' }, { code: 'ms', name: 'Malay' }, { code: 'tl', name: 'Filipino' },
  { code: 'uk', name: 'Ukrainian' }, { code: 'sv', name: 'Swedish' }, { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' }, { code: 'fi', name: 'Finnish' }, { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' }, { code: 'hu', name: 'Hungarian' }, { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' }, { code: 'fa', name: 'Persian' }, { code: 'sk', name: 'Slovak' },
  { code: 'bg', name: 'Bulgarian' }, { code: 'hr', name: 'Croatian' }, { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' }, { code: 'et', name: 'Estonian' }, { code: 'sl', name: 'Slovenian' },
  { code: 'sr', name: 'Serbian' }, { code: 'sw', name: 'Swahili' }, { code: 'am', name: 'Amharic' },
  { code: 'ur', name: 'Urdu' }, { code: 'ta', name: 'Tamil' }, { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' }, { code: 'gu', name: 'Gujarati' }, { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' }, { code: 'pa', name: 'Punjabi' }, { code: 'ne', name: 'Nepali' },
  { code: 'si', name: 'Sinhala' }, { code: 'km', name: 'Khmer' }, { code: 'lo', name: 'Lao' },
  { code: 'my', name: 'Burmese' }, { code: 'ka', name: 'Georgian' }, { code: 'az', name: 'Azerbaijani' },
  { code: 'kk', name: 'Kazakh' }, { code: 'hy', name: 'Armenian' }, { code: 'af', name: 'Afrikaans' },
  { code: 'zu', name: 'Zulu' }, { code: 'yo', name: 'Yoruba' }, { code: 'ig', name: 'Igbo' },
  { code: 'ha', name: 'Hausa' }, { code: 'so', name: 'Somali' },
];

interface FiltersPanelProps {
  params: SearchParams;
  onChange: (p: Partial<SearchParams>) => void;
  onReset: () => void;
  onClose?: () => void;
  collections: Collection[];
  activeCollection: string | null;
  onCollectionChange: (id: string | null) => void;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">{label}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// Single-select segmented control — clean alternative to a dropdown for 2–4 options
function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex p-0.5 gap-0.5 rounded-lg bg-muted/40 border border-border/40">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 h-7 rounded-md text-xs font-medium transition-colors',
            value === o.value ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Wrapping pill group for single-select with more options
function PillGroup<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 h-7 rounded-full text-xs font-medium border transition-colors',
            value === o.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


const CATEGORY_OPTS = [
  { value: 'ALL', label: 'All' },
  { value: 'POLITICAL', label: 'Political' },
  { value: 'HOUSING', label: 'Housing' },
  { value: 'EMPLOYMENT', label: 'Jobs' },
  { value: 'CREDIT', label: 'Credit' },
];
const MEDIA_OPTS = [
  { value: 'ALL', label: 'All' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'meme', label: 'Meme' },
  { value: 'multi_video', label: 'Multi-video' },
];
const PLATFORM_OPTS = [
  { value: 'ALL', label: 'All' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'AUDIENCE_NETWORK', label: 'Audience Net' },
  { value: 'MESSENGER', label: 'Messenger' },
];
const LIMIT_OPTS = [
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: '200', label: '200' },
  { value: '500', label: '500' },
];

export function FiltersPanel({ params, onChange, onReset, onClose, collections, activeCollection, onCollectionChange }: FiltersPanelProps) {
  const activeCount = [
    params.language,
    params.category && params.category !== 'ALL',
    params.ad_type,
    params.platform,
    params.status && params.status !== 'ALL',
    params.date_from,
    params.date_to,
  ].filter(Boolean).length;

  return (
    <ScrollArea className="h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 bg-card/80 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Filters</h3>
          {activeCount > 0 && (
            <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onReset}
            disabled={activeCount === 0}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Hide filters"
              className="ml-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        <Group label="Geography">
          <Field label="Country">
            <CountryCombobox value={params.country || 'ALL'} onChange={(v) => onChange({ country: v })} />
          </Field>
          <Field label="Language">
            <Select value={params.language || ''} onValueChange={(v) => onChange({ language: v || undefined })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Languages" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code} className="text-xs">{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Group>

        <Separator className="opacity-30" />

        <Group label="Status">
          <Segmented
            value={(params.status as string) || 'ALL'}
            options={[
              { value: 'ALL', label: 'Both' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
            onChange={(v) => onChange({ status: v === 'ALL' ? undefined : (v as SearchParams['status']) })}
          />
        </Group>

        <Separator className="opacity-30" />

        <Group label="Media type">
          <PillGroup
            value={params.ad_type || 'ALL'}
            options={MEDIA_OPTS}
            onChange={(v) => onChange({ ad_type: v === 'ALL' ? undefined : (v as SearchParams['ad_type']) })}
          />
        </Group>

        <Group label="Platform">
          <PillGroup
            value={params.platform || 'ALL'}
            options={PLATFORM_OPTS}
            onChange={(v) => onChange({ platform: v === 'ALL' ? undefined : (v as SearchParams['platform']) })}
          />
        </Group>

        <Group label="Category">
          <PillGroup
            value={params.category || 'ALL'}
            options={CATEGORY_OPTS}
            onChange={(v) => onChange({ category: v as SearchParams['category'] })}
          />
        </Group>

        <Separator className="opacity-30" />

        <Group label="Date started">
          <div className="grid grid-cols-2 gap-2">
            <Field label="After">
              <Input
                type="date"
                className="h-8 text-xs"
                suppressHydrationWarning
                value={params.date_from || ''}
                onChange={(e) => onChange({ date_from: e.target.value || undefined })}
              />
            </Field>
            <Field label="Before">
              <Input
                type="date"
                className="h-8 text-xs"
                suppressHydrationWarning
                value={params.date_to || ''}
                onChange={(e) => onChange({ date_to: e.target.value || undefined })}
              />
            </Field>
          </div>
        </Group>

        <Separator className="opacity-30" />

        <Group label="Max ads to scrape">
          <PillGroup
            value={String(params.limit || 100)}
            options={LIMIT_OPTS}
            onChange={(v) => onChange({ limit: Number(v) })}
          />
        </Group>

        {collections.length > 0 && (
          <>
            <Separator className="opacity-30" />
            <Group label="Collections">
              <div className="space-y-1">
                <button
                  onClick={() => onCollectionChange(null)}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2',
                    !activeCollection ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <FolderOpen className="w-3.5 h-3.5" /> All saved
                </button>
                {collections.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onCollectionChange(c.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between gap-2',
                      activeCollection === c.id ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color || '#6366f1' }} />
                      <span className="truncate">{c.name}</span>
                    </span>
                    {c.ad_count != null && <span className="text-muted-foreground/60">{c.ad_count}</span>}
                  </button>
                ))}
              </div>
            </Group>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
