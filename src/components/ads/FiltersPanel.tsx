'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SearchParams, Collection } from '@/types/ads';
import { RotateCcw } from 'lucide-react';

const COUNTRIES = [
  { code: 'ALL', name: 'All Countries' }, { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' }, { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' }, { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'UAE' }, { code: 'ZA', name: 'South Africa' },
];

interface FiltersPanelProps {
  params: SearchParams;
  onChange: (p: Partial<SearchParams>) => void;
  onReset: () => void;
  collections: Collection[];
  activeCollection: string | null;
  onCollectionChange: (id: string | null) => void;
}

export function FiltersPanel({ params, onChange, onReset, collections, activeCollection, onCollectionChange }: FiltersPanelProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Filters</h3>
          <Button size="sm" variant="ghost" onClick={onReset} className="h-7 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Country</Label>
          <Select value={params.country || 'ALL'} onValueChange={(v) => onChange({ country: v ?? undefined })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Ad Category</Label>
          <Select value={params.category || 'ALL'} onValueChange={(v) => onChange({ category: v as SearchParams['category'] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Ads</SelectItem>
              <SelectItem value="POLITICAL" className="text-xs">Political & Issues</SelectItem>
              <SelectItem value="HOUSING" className="text-xs">Housing</SelectItem>
              <SelectItem value="EMPLOYMENT" className="text-xs">Employment</SelectItem>
              <SelectItem value="CREDIT" className="text-xs">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Platform</Label>
          <Select value={params.platform || 'ALL'} onValueChange={(v) => onChange({ platform: v === 'ALL' ? undefined : v as SearchParams['platform'] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Platforms</SelectItem>
              <SelectItem value="FACEBOOK" className="text-xs">Facebook</SelectItem>
              <SelectItem value="INSTAGRAM" className="text-xs">Instagram</SelectItem>
              <SelectItem value="AUDIENCE_NETWORK" className="text-xs">Audience Network</SelectItem>
              <SelectItem value="MESSENGER" className="text-xs">Messenger</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Ad Type</Label>
          <Select value={params.ad_type || 'ALL'} onValueChange={(v) => onChange({ ad_type: v === 'ALL' ? undefined : v as SearchParams['ad_type'] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Types</SelectItem>
              <SelectItem value="image" className="text-xs">Image</SelectItem>
              <SelectItem value="video" className="text-xs">Video</SelectItem>
              <SelectItem value="carousel" className="text-xs">Carousel</SelectItem>
              <SelectItem value="meme" className="text-xs">Meme</SelectItem>
              <SelectItem value="multi_video" className="text-xs">Multi-video</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Status</Label>
          <Select value={(params.status as string) || 'ALL'} onValueChange={(v) => onChange({ status: v === 'ALL' ? undefined : v as SearchParams['status'] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All</SelectItem>
              <SelectItem value="ACTIVE" className="text-xs">Active Only</SelectItem>
              <SelectItem value="INACTIVE" className="text-xs">Inactive Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Start Date From</Label>
          <Input type="date" className="h-8 text-xs" value={params.date_from || ''} onChange={(e) => onChange({ date_from: e.target.value || undefined })} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Start Date To</Label>
          <Input type="date" className="h-8 text-xs" value={params.date_to || ''} onChange={(e) => onChange({ date_to: e.target.value || undefined })} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Language</Label>
          <Input placeholder="e.g. en" className="h-8 text-xs" value={params.language || ''} onChange={(e) => onChange({ language: e.target.value || undefined })} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Max Results</Label>
          <Select value={String(params.limit || 100)} onValueChange={(v) => onChange({ limit: Number(v) })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25" className="text-xs">25 ads</SelectItem>
              <SelectItem value="50" className="text-xs">50 ads</SelectItem>
              <SelectItem value="100" className="text-xs">100 ads</SelectItem>
              <SelectItem value="200" className="text-xs">200 ads</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {collections.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Collections</Label>
              <div className="space-y-1">
                <button
                  onClick={() => onCollectionChange(null)}
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${!activeCollection ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  All saved ads
                </button>
                {collections.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onCollectionChange(c.id)}
                    className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between ${activeCollection === c.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    <span>📁 {c.name}</span>
                    {c.ad_count != null && <span className="opacity-60">{c.ad_count}</span>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
