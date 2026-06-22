'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Ad } from '@/types/ads';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, ExternalLink, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';

interface AdModalProps {
  ad: Ad | null;
  open: boolean;
  onClose: () => void;
}

export function AdModal({ ad, open, onClose }: AdModalProps) {
  const [carouselIdx, setCarouselIdx] = useState(0);

  if (!ad) return null;

  const hasDemo = ad.demographic_distribution.length > 0 || ad.region_distribution.length > 0;

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">{ad.advertiser_name}</DialogTitle>
            <div className="flex gap-2">
              <Badge variant={ad.status === 'ACTIVE' ? 'default' : 'secondary'}
                className={ad.status === 'ACTIVE' ? 'bg-green-500' : ''}
              >
                {ad.status}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => window.open(ad.ad_snapshot_url, '_blank')}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open Original
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="creative" className="flex-1 overflow-hidden">
          <TabsList className="mx-6 mt-4">
            <TabsTrigger value="creative">Creative</TabsTrigger>
            <TabsTrigger value="copy">Copy</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            {hasDemo && <TabsTrigger value="demographics">Demographics</TabsTrigger>}
          </TabsList>

          <ScrollArea className="h-[calc(90vh-180px)]">
            {/* Creative Tab */}
            <TabsContent value="creative" className="p-6 mt-0">
              {ad.media_type === 'carousel' && ad.carousel_cards.length > 0 ? (
                <div className="space-y-3">
                  <div className="relative bg-muted rounded-lg overflow-hidden aspect-video">
                    {ad.carousel_cards[carouselIdx]?.image_url ? (
                      <img src={ad.carousel_cards[carouselIdx].image_url} alt={`Slide ${carouselIdx + 1}`} className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
                    )}
                    <div className="absolute inset-y-0 left-2 flex items-center">
                      <button onClick={() => setCarouselIdx(Math.max(0, carouselIdx - 1))} className="bg-black/50 rounded-full p-1" disabled={carouselIdx === 0}>
                        <ChevronLeft className="w-5 h-5 text-white" />
                      </button>
                    </div>
                    <div className="absolute inset-y-0 right-2 flex items-center">
                      <button onClick={() => setCarouselIdx(Math.min(ad.carousel_cards.length - 1, carouselIdx + 1))} className="bg-black/50 rounded-full p-1" disabled={carouselIdx === ad.carousel_cards.length - 1}>
                        <ChevronRight className="w-5 h-5 text-white" />
                      </button>
                    </div>
                    <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
                      {ad.carousel_cards.map((_, i) => (
                        <button key={i} onClick={() => setCarouselIdx(i)}
                          className={`w-1.5 h-1.5 rounded-full ${i === carouselIdx ? 'bg-white' : 'bg-white/40'}`}
                        />
                      ))}
                    </div>
                  </div>
                  {ad.carousel_cards[carouselIdx]?.title && (
                    <p className="font-medium">{ad.carousel_cards[carouselIdx].title}</p>
                  )}
                  {ad.carousel_cards[carouselIdx]?.body && (
                    <p className="text-sm text-muted-foreground">{ad.carousel_cards[carouselIdx].body}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{carouselIdx + 1} / {ad.carousel_cards.length} slides</p>
                </div>
              ) : ad.media_urls[0] ? (
                <div className="space-y-3">
                  <div className="relative bg-muted rounded-lg overflow-hidden">
                    {ad.media_type === 'video' || ad.media_type === 'multi_video' ? (
                      <video src={ad.media_urls[0]} controls className="w-full max-h-96 object-contain" />
                    ) : (
                      <img src={ad.media_urls[0]} alt="Ad creative" className="w-full max-h-96 object-contain" />
                    )}
                  </div>
                  <a
                    href={`/api/download?url=${encodeURIComponent(ad.media_urls[0])}`}
                    download
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Creative
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-muted-foreground">No creative available</div>
              )}
            </TabsContent>

            {/* Copy Tab */}
            <TabsContent value="copy" className="p-6 mt-0 space-y-4">
              {ad.body_variants.map((body, i) => (
                <div key={i} className="space-y-1">
                  {ad.body_variants.length > 1 && (
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variant {i + 1}</p>
                  )}
                  <div className="relative group bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap">
                    {body}
                    <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => copyText(body)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {ad.headline && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Headline</p>
                  <div className="relative group bg-muted rounded-lg p-3 font-medium text-sm">
                    {ad.headline}
                    <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => copyText(ad.headline!)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
              {ad.cta_text && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">CTA</p>
                  <Badge variant="outline" className="text-sm">{ad.cta_text}</Badge>
                </div>
              )}
              {ad.link_url && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Landing URL</p>
                  <a href={ad.link_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary underline break-all hover:opacity-80">
                    {ad.link_url}
                  </a>
                </div>
              )}
            </TabsContent>

            {/* Metadata Tab */}
            <TabsContent value="metadata" className="p-6 mt-0">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ['Status', ad.status],
                  ['Media Type', ad.media_type],
                  ['Platforms', ad.platforms.join(', ') || '—'],
                  ['Days Running', ad.days_running != null ? `${ad.days_running} days` : '—'],
                  ['Started', ad.started_at ? format(new Date(ad.started_at), 'MMM d, yyyy') : '—'],
                  ['Stopped', ad.stopped_at ? format(new Date(ad.stopped_at), 'MMM d, yyyy') : '—'],
                  ['Spend Range', ad.spend_min != null ? `${ad.spend_currency || '$'}${ad.spend_min.toLocaleString()} – ${ad.spend_currency || '$'}${ad.spend_max?.toLocaleString()}` : 'N/A'],
                  ['Impressions', ad.impressions_min != null ? `${ad.impressions_min.toLocaleString()} – ${ad.impressions_max?.toLocaleString()}` : 'N/A'],
                  ['Funding Entity', ad.funding_entity || 'N/A'],
                  ['Country', ad.country || '—'],
                  ['Language', ad.language || '—'],
                  ['Scraped', format(new Date(ad.scraped_at), 'MMM d, yyyy HH:mm')],
                ].map(([label, value]) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Demographics Tab */}
            {hasDemo && (
              <TabsContent value="demographics" className="p-6 mt-0 space-y-6">
                {ad.demographic_distribution.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-3">Age & Gender Distribution</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={ad.demographic_distribution}>
                        <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Bar dataKey="percentage" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {ad.region_distribution.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-3">Region Distribution</p>
                    <div className="space-y-2">
                      {ad.region_distribution.slice(0, 10).map((r) => (
                        <div key={r.region} className="flex items-center gap-3">
                          <span className="text-sm w-32 truncate">{r.region}</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className="bg-primary rounded-full h-2" style={{ width: `${r.percentage}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">{r.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
