'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Ad } from '@/types/ads';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { Download, ExternalLink, Copy, ChevronLeft, ChevronRight, MapPin, Users, Target, ImageDown, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { TagEditor } from './TagEditor';
import { adsToCsv, exportFilename } from '@/lib/exportCsv';
import { downloadAdMedia, adMediaUrls, downloadSingleUrl, mediaSrc } from '@/lib/downloadMedia';

interface AdModalProps {
  ad: Ad | null;
  open: boolean;
  onClose: () => void;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export function AdModal({ ad, open, onClose }: AdModalProps) {
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [dlMedia, setDlMedia] = useState(false);
  const [dlItem, setDlItem] = useState(false);

  if (!ad) return null;

  const mediaCount = adMediaUrls(ad).length;
  // Drop dynamic/catalog variants that are only Meta template tokens like {{product.brand}}
  // (filled at delivery from a product feed) — they aren't real copy. Cleans up ads already in the DB.
  const copyVariants = ad.body_variants.filter((b) => b.replace(/\{\{[^}]*\}\}/g, '').trim().length > 0);
  // An ad with no creative, no copy, no headline and no carousel was almost
  // certainly removed/taken down by Meta after we scraped it — the library keeps
  // the record but strips the content. Flag it so the user isn't left guessing.
  const isUnavailable =
    mediaCount === 0 &&
    !ad.video_urls?.[0] &&
    copyVariants.length === 0 &&
    !ad.headline &&
    ad.carousel_cards.length === 0;
  async function handleDownloadMedia() {
    if (!ad) return;
    setDlMedia(true);
    try { await downloadAdMedia(ad); } finally { setDlMedia(false); }
  }
  async function handleDownloadOne(url?: string) {
    if (!ad || !url) return;
    setDlItem(true);
    try { await downloadSingleUrl(ad, url); } finally { setDlItem(false); }
  }

  const hasDemo = ad.demographic_distribution.length > 0 || ad.region_distribution.length > 0;
  const hasTargeting = ad.deep_search_done && (
    ad.targeting_age_min != null ||
    ad.targeting_locations?.length ||
    ad.targeting_interests?.length ||
    ad.policy_status
  );
  const isVideo = ad.media_type === 'video' || ad.media_type === 'multi_video';
  const videoSrc = ad.video_urls?.[0];
  const thumbSrc = ad.media_urls?.[0];

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function exportAd(format: 'csv' | 'json') {
    const data = format === 'csv' ? adsToCsv([ad!]) : JSON.stringify(ad, null, 2);
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
    const name = exportFilename('ad', ad!.advertiser_name).replace(/\.csv$/, format === 'json' ? '.json' : '.csv');
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-4xl max-h-[88vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-0">
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base font-semibold truncate min-w-0">{ad.advertiser_name}</DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                className={`text-[10px] px-1.5 py-0 h-5 font-medium ${
                  ad.status === 'ACTIVE'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                    : 'bg-muted text-muted-foreground border-transparent'
                }`}
              >
                {ad.status === 'ACTIVE' ? (
                  <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1 animate-pulse" />Active</>
                ) : 'Inactive'}
              </Badge>
              {mediaCount > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleDownloadMedia} disabled={dlMedia} title={`Download media (${mediaCount} file${mediaCount > 1 ? 's' : ''})`}>
                  {dlMedia ? <Loader2 className="w-3 h-3 sm:mr-1 animate-spin" /> : <ImageDown className="w-3 h-3 sm:mr-1" />}
                  <span className="hidden sm:inline">Media{mediaCount > 1 ? ` (${mediaCount})` : ''}</span>
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => exportAd('csv')} title="Export this ad's data as CSV">
                <Download className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Export</span>
              </Button>
              {ad.ad_snapshot_url && (
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => window.open(ad.ad_snapshot_url, '_blank')}>
                  <ExternalLink className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Open Original</span>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {isUnavailable && (
          <div className="mx-5 sm:mx-6 mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="text-amber-200/90">
              <p className="font-medium">This ad&apos;s content is no longer available</p>
              <p className="text-amber-300/70 mt-0.5">
                Meta still lists this ad but has stripped its creative and copy. It was likely removed or taken down after it was scraped. The metadata below is what remains.
              </p>
            </div>
          </div>
        )}

        <div className="px-5 sm:px-6 pt-3">
          <TagEditor adId={ad.id} />
        </div>

        <Tabs defaultValue="creative" className="flex flex-col min-h-0">
          <TabsList className="mx-6 mt-4 h-8">
            <TabsTrigger value="creative" className="text-xs">Creative</TabsTrigger>
            <TabsTrigger value="copy" className="text-xs">Copy</TabsTrigger>
            <TabsTrigger value="metadata" className="text-xs">Metadata</TabsTrigger>
            {hasDemo && <TabsTrigger value="demographics" className="text-xs">Demographics</TabsTrigger>}
            {hasTargeting && <TabsTrigger value="targeting" className="text-xs">Targeting</TabsTrigger>}
          </TabsList>

          <div className="overflow-y-auto max-h-[68vh]">
            {/* Creative */}
            <TabsContent value="creative" className="p-6 mt-0">
              {ad.media_type === 'carousel' && ad.carousel_cards.length > 0 ? (
                <div className="space-y-3">
                  <div className="relative bg-muted rounded-xl overflow-hidden aspect-video">
                    {ad.carousel_cards[carouselIdx]?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaSrc(ad.carousel_cards[carouselIdx].image_url)}
                        alt={`Slide ${carouselIdx + 1}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No image</div>
                    )}
                    {ad.carousel_cards.length > 1 && (
                      <>
                        <div className="absolute inset-y-0 left-2 flex items-center">
                          <button
                            onClick={() => setCarouselIdx(Math.max(0, carouselIdx - 1))}
                            disabled={carouselIdx === 0}
                            className="bg-black/60 rounded-full p-1 disabled:opacity-30 transition-opacity"
                          >
                            <ChevronLeft className="w-5 h-5 text-white" />
                          </button>
                        </div>
                        <div className="absolute inset-y-0 right-2 flex items-center">
                          <button
                            onClick={() => setCarouselIdx(Math.min(ad.carousel_cards.length - 1, carouselIdx + 1))}
                            disabled={carouselIdx === ad.carousel_cards.length - 1}
                            className="bg-black/60 rounded-full p-1 disabled:opacity-30 transition-opacity"
                          >
                            <ChevronRight className="w-5 h-5 text-white" />
                          </button>
                        </div>
                        <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
                          {ad.carousel_cards.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setCarouselIdx(i)}
                              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === carouselIdx ? 'bg-white' : 'bg-white/40'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {ad.carousel_cards[carouselIdx]?.title && (
                    <p className="font-medium text-sm">{ad.carousel_cards[carouselIdx].title}</p>
                  )}
                  {ad.carousel_cards[carouselIdx]?.body && (
                    <p className="text-sm text-muted-foreground">{ad.carousel_cards[carouselIdx].body}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{carouselIdx + 1} / {ad.carousel_cards.length} slides</p>
                </div>
              ) : isVideo ? (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden bg-black">
                    {videoSrc ? (
                      <video src={mediaSrc(videoSrc)} poster={mediaSrc(thumbSrc)} controls className="w-full max-h-96 object-contain" playsInline />
                    ) : thumbSrc ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaSrc(thumbSrc)} alt="Video thumbnail" className="w-full max-h-96 object-contain" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <p className="text-white/70 text-sm">Video not available for playback</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No video available</div>
                    )}
                  </div>
                  {videoSrc && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleDownloadOne(videoSrc)} disabled={dlItem}>
                      {dlItem ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                      Download Video
                    </Button>
                  )}
                </div>
              ) : thumbSrc ? (
                <div className="space-y-3">
                  <div className="relative bg-muted rounded-xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaSrc(thumbSrc)} alt="Ad creative" className="w-full max-h-96 object-contain" />
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleDownloadOne(thumbSrc)} disabled={dlItem}>
                    {dlItem ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                    Download Image
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No creative available</div>
              )}
            </TabsContent>

            {/* Copy */}
            <TabsContent value="copy" className="p-6 mt-0 space-y-4">
              {copyVariants.length === 0 && (
                <p className="text-sm text-muted-foreground">No copy available</p>
              )}
              {copyVariants.map((body, i) => (
                <div key={i} className="space-y-1">
                  {copyVariants.length > 1 && (
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variant {i + 1}</p>
                  )}
                  <div className="relative group bg-muted/50 border border-border/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                    {body}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyText(body)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {ad.headline && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Headline</p>
                  <div className="relative group bg-muted/50 border border-border/50 rounded-lg p-3 font-medium text-sm">
                    {ad.headline}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyText(ad.headline!)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
              {ad.cta_text && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">CTA</p>
                  <Badge variant="outline">{ad.cta_text}</Badge>
                </div>
              )}
              {ad.link_url && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Landing URL</p>
                  <a
                    href={ad.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline break-all hover:opacity-80"
                  >
                    {ad.link_url}
                  </a>
                </div>
              )}
            </TabsContent>

            {/* Metadata */}
            <TabsContent value="metadata" className="p-6 mt-0">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <MetaRow label="Status" value={ad.status} />
                <MetaRow label="Media Type" value={ad.media_type} />
                <MetaRow label="Platforms" value={ad.platforms.join(', ') || '—'} />
                <MetaRow label="Days Running" value={ad.days_running != null ? `${ad.days_running} days` : '—'} />
                <MetaRow label="Started" value={ad.started_at ? format(new Date(ad.started_at), 'MMM d, yyyy') : '—'} />
                <MetaRow label="Stopped" value={ad.stopped_at ? format(new Date(ad.stopped_at), 'MMM d, yyyy') : '—'} />
                <MetaRow
                  label="Spend Range"
                  value={ad.spend_min != null
                    ? `${ad.spend_currency || '$'}${ad.spend_min.toLocaleString()} – ${ad.spend_currency || '$'}${ad.spend_max?.toLocaleString()}`
                    : 'N/A'}
                />
                <MetaRow
                  label="Impressions"
                  value={ad.impressions_min != null
                    ? `${ad.impressions_min.toLocaleString()} – ${ad.impressions_max?.toLocaleString()}`
                    : 'N/A'}
                />
                <MetaRow label="Funding Entity" value={ad.funding_entity || 'N/A'} />
                <MetaRow label="Country" value={ad.country || '—'} />
                <MetaRow label="Language" value={ad.language || '—'} />
                <MetaRow label="Scraped" value={format(new Date(ad.scraped_at), 'MMM d, yyyy HH:mm')} />
              </div>

              {/* "See ad details" / EU transparency */}
              {ad.detail_fetched && (
                <div className="mt-5 pt-4 border-t border-border/40">
                  <p className="text-xs font-medium text-violet-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" /> Ad Details (EU transparency)
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <MetaRow label="Total Reach (EU)" value={ad.total_reach != null ? ad.total_reach.toLocaleString() : '—'} />
                    <MetaRow label="Beneficiary" value={ad.beneficiary || '—'} />
                    <MetaRow label="Payer" value={ad.payer || '—'} />
                  </div>
                  {ad.total_reach == null && ad.region_distribution.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 mt-2">
                      No EU breakdown available — Meta only publishes reach/demographics for ads that ran in the EU.
                    </p>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Demographics */}
            {hasDemo && (
              <TabsContent value="demographics" className="p-6 mt-0 space-y-6">
                {ad.demographic_distribution.length > 0 && (
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <p className="text-sm font-medium">Age &amp; Gender Distribution</p>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-chart-2)' }} /> Male
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--color-chart-5)' }} /> Female
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={ad.demographic_distribution} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis
                          dataKey="age"
                          tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                          stroke="var(--color-border)"
                        />
                        <YAxis
                          tickFormatter={(v) => `${v}%`}
                          tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                          stroke="var(--color-border)"
                        />
                        <Tooltip
                          cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }}
                          formatter={(v, _n, item) => [`${v}%`, item?.payload?.gender ?? '']}
                          labelFormatter={(l) => `Age ${l}`}
                          contentStyle={{
                            background: 'var(--color-popover)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 8,
                            fontSize: 12,
                            color: 'var(--color-popover-foreground)',
                          }}
                        />
                        <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                          {ad.demographic_distribution.map((d, i) => (
                            <Cell key={i} fill={d.gender === 'female' ? 'var(--color-chart-5)' : 'var(--color-chart-2)'} />
                          ))}
                        </Bar>
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
                          <span className="text-sm w-12 shrink-0 truncate">{r.region}</span>
                          <div className="flex-1 min-w-0 bg-muted rounded-full h-1.5">
                            <motion.div
                              className="bg-primary rounded-full h-1.5"
                              initial={{ width: 0 }}
                              animate={{ width: `${r.percentage}%` }}
                              transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.1 }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 shrink-0 text-right tabular-nums">{r.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            )}

            {/* Deep Search — Targeting */}
            {hasTargeting && (
              <TabsContent value="targeting" className="p-6 mt-0 space-y-5">
                <div className="flex items-center gap-2 text-xs text-violet-400 mb-1">
                  <Target className="w-3.5 h-3.5" />
                  <span className="font-medium uppercase tracking-wide">Deep Search Data</span>
                </div>

                {(ad.targeting_age_min != null || ad.targeting_age_max != null || ad.targeting_gender) && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Users className="w-3 h-3" /> Audience
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {(ad.targeting_age_min != null || ad.targeting_age_max != null) && (
                        <MetaRow
                          label="Age Range"
                          value={`${ad.targeting_age_min ?? '?'} – ${ad.targeting_age_max ?? '?'}`}
                        />
                      )}
                      {ad.targeting_gender && (
                        <MetaRow label="Gender" value={ad.targeting_gender} />
                      )}
                    </div>
                  </div>
                )}

                {ad.targeting_locations && ad.targeting_locations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Locations
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ad.targeting_locations.map((loc) => (
                        <Badge key={loc} variant="outline" className="text-xs">{loc}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {ad.targeting_interests && ad.targeting_interests.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Target className="w-3 h-3" /> Interests &amp; Behaviors
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ad.targeting_interests.map((interest) => (
                        <Badge key={interest} variant="secondary" className="text-xs">{interest}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {ad.policy_status && (
                  <MetaRow label="Policy Status" value={ad.policy_status} />
                )}
              </TabsContent>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
