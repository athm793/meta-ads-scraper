'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SearchParams, Collection } from '@/types/ads';
import { RotateCcw, Check, ChevronsUpDown, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'ALL', name: 'All Countries' },
  { code: 'AF', name: 'Afghanistan' }, { code: 'AL', name: 'Albania' }, { code: 'DZ', name: 'Algeria' },
  { code: 'AD', name: 'Andorra' }, { code: 'AO', name: 'Angola' }, { code: 'AG', name: 'Antigua and Barbuda' },
  { code: 'AR', name: 'Argentina' }, { code: 'AM', name: 'Armenia' }, { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' }, { code: 'AZ', name: 'Azerbaijan' }, { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' }, { code: 'BD', name: 'Bangladesh' }, { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' }, { code: 'BE', name: 'Belgium' }, { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' }, { code: 'BT', name: 'Bhutan' }, { code: 'BO', name: 'Bolivia' },
  { code: 'BA', name: 'Bosnia and Herzegovina' }, { code: 'BW', name: 'Botswana' }, { code: 'BR', name: 'Brazil' },
  { code: 'BN', name: 'Brunei' }, { code: 'BG', name: 'Bulgaria' }, { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' }, { code: 'CV', name: 'Cabo Verde' }, { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' }, { code: 'CA', name: 'Canada' }, { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' }, { code: 'CL', name: 'Chile' }, { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' }, { code: 'KM', name: 'Comoros' }, { code: 'CD', name: 'Congo (DRC)' },
  { code: 'CG', name: 'Congo (Republic)' }, { code: 'CR', name: 'Costa Rica' }, { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'HR', name: 'Croatia' }, { code: 'CU', name: 'Cuba' }, { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' }, { code: 'DK', name: 'Denmark' }, { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' }, { code: 'DO', name: 'Dominican Republic' }, { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' }, { code: 'SV', name: 'El Salvador' }, { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' }, { code: 'EE', name: 'Estonia' }, { code: 'SZ', name: 'Eswatini' },
  { code: 'ET', name: 'Ethiopia' }, { code: 'FJ', name: 'Fiji' }, { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' }, { code: 'GA', name: 'Gabon' }, { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' }, { code: 'DE', name: 'Germany' }, { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' }, { code: 'GD', name: 'Grenada' }, { code: 'GT', name: 'Guatemala' },
  { code: 'GN', name: 'Guinea' }, { code: 'GW', name: 'Guinea-Bissau' }, { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' }, { code: 'HN', name: 'Honduras' }, { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' }, { code: 'IS', name: 'Iceland' }, { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' }, { code: 'IR', name: 'Iran' }, { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' }, { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' }, { code: 'JP', name: 'Japan' }, { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' }, { code: 'KE', name: 'Kenya' }, { code: 'KI', name: 'Kiribati' },
  { code: 'KW', name: 'Kuwait' }, { code: 'KG', name: 'Kyrgyzstan' }, { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' }, { code: 'LB', name: 'Lebanon' }, { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' }, { code: 'LY', name: 'Libya' }, { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' }, { code: 'LU', name: 'Luxembourg' }, { code: 'MO', name: 'Macao' },
  { code: 'MG', name: 'Madagascar' }, { code: 'MW', name: 'Malawi' }, { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' }, { code: 'ML', name: 'Mali' }, { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' }, { code: 'MR', name: 'Mauritania' }, { code: 'MU', name: 'Mauritius' },
  { code: 'MX', name: 'Mexico' }, { code: 'FM', name: 'Micronesia' }, { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' }, { code: 'MN', name: 'Mongolia' }, { code: 'ME', name: 'Montenegro' },
  { code: 'MA', name: 'Morocco' }, { code: 'MZ', name: 'Mozambique' }, { code: 'MM', name: 'Myanmar' },
  { code: 'NA', name: 'Namibia' }, { code: 'NR', name: 'Nauru' }, { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' }, { code: 'NZ', name: 'New Zealand' }, { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' }, { code: 'NG', name: 'Nigeria' }, { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' }, { code: 'PK', name: 'Pakistan' }, { code: 'PW', name: 'Palau' },
  { code: 'PS', name: 'Palestine' }, { code: 'PA', name: 'Panama' }, { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' }, { code: 'PE', name: 'Peru' }, { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' }, { code: 'PR', name: 'Puerto Rico' },
  { code: 'QA', name: 'Qatar' }, { code: 'MK', name: 'North Macedonia' }, { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' }, { code: 'RW', name: 'Rwanda' }, { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'LC', name: 'Saint Lucia' }, { code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', name: 'Samoa' }, { code: 'SM', name: 'San Marino' }, { code: 'ST', name: 'São Tomé and Príncipe' },
  { code: 'SA', name: 'Saudi Arabia' }, { code: 'SN', name: 'Senegal' }, { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' }, { code: 'SL', name: 'Sierra Leone' }, { code: 'SG', name: 'Singapore' },
  { code: 'SK', name: 'Slovakia' }, { code: 'SI', name: 'Slovenia' }, { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' }, { code: 'ZA', name: 'South Africa' }, { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' }, { code: 'LK', name: 'Sri Lanka' }, { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' }, { code: 'SE', name: 'Sweden' }, { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' }, { code: 'TW', name: 'Taiwan' }, { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' }, { code: 'TH', name: 'Thailand' }, { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' }, { code: 'TO', name: 'Tonga' }, { code: 'TT', name: 'Trinidad and Tobago' },
  { code: 'TN', name: 'Tunisia' }, { code: 'TR', name: 'Turkey' }, { code: 'TM', name: 'Turkmenistan' },
  { code: 'TV', name: 'Tuvalu' }, { code: 'UG', name: 'Uganda' }, { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' }, { code: 'UY', name: 'Uruguay' }, { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' }, { code: 'VE', name: 'Venezuela' }, { code: 'VN', name: 'Vietnam' },
  { code: 'YE', name: 'Yemen' }, { code: 'ZM', name: 'Zambia' }, { code: 'ZW', name: 'Zimbabwe' },
];

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

function CountryCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = COUNTRIES.find((c) => c.code === value);

  const filtered = query
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : COUNTRIES;

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        className="flex items-center justify-between w-full h-8 px-2.5 text-xs rounded-lg border border-input bg-transparent hover:bg-accent/50 transition-colors"
      >
        <span className="truncate">{selected?.name || 'All Countries'}</span>
        <ChevronsUpDown className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-1" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
          >
            <div className="p-1.5 border-b border-border/50">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search country..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground/60 px-1 py-0.5"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No country found.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false); setQuery(''); }}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs hover:bg-accent transition-colors text-left',
                      value === c.code && 'text-primary font-medium'
                    )}
                  >
                    <Check className={cn('w-3 h-3 flex-shrink-0', value === c.code ? 'opacity-100' : 'opacity-0')} />
                    {c.name}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

export function FiltersPanel({ params, onChange, onReset, collections, activeCollection, onCollectionChange }: FiltersPanelProps) {
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
        <button
          onClick={onReset}
          disabled={activeCount === 0}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
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
