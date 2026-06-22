import type { Ad } from '@/types/ads';

// UTF-8 byte-order mark — without it Excel reads the file as ANSI and mangles
// emojis / curly quotes into mojibake.
export const BOM = '﻿';

export const AD_CSV_HEADER = [
  'ID', 'Advertiser', 'Status', 'Media Type', 'Ad Copy', 'Headline', 'CTA',
  'Landing URL', 'Image URLs', 'Video URLs', 'Platforms', 'Started', 'Stopped', 'Days Running',
  'Spend Min', 'Spend Max', 'Impressions Min', 'Impressions Max',
  'Funding Entity', 'Ad Library URL', 'Country', 'Language', 'Scraped At',
  'Details Fetched', 'Total Reach (EU)', 'Beneficiary', 'Payer',
  'Top Regions', 'Age/Gender Breakdown',
].map((h) => `"${h}"`).join(',');

export function adToCsvRow(ad: Ad): string {
  const imageUrls = [...(ad.media_urls ?? []), ...ad.carousel_cards.map((c) => c.image_url).filter(Boolean) as string[]];
  const videoUrls = [...(ad.video_urls ?? []), ...ad.carousel_cards.map((c) => c.video_url).filter(Boolean) as string[]];
  const fields = [
    ad.id,
    ad.advertiser_name,
    ad.status,
    ad.media_type,
    ad.body_variants.join(' | '),
    ad.headline || '',
    ad.cta_text || '',
    ad.link_url || '',
    [...new Set(imageUrls)].join('\n'),
    [...new Set(videoUrls)].join('\n'),
    ad.platforms.join(', '),
    ad.started_at || '',
    ad.stopped_at || '',
    String(ad.days_running ?? ''),
    ad.spend_min != null ? `${ad.spend_currency || '$'}${ad.spend_min}` : '',
    ad.spend_max != null ? `${ad.spend_currency || '$'}${ad.spend_max}` : '',
    ad.impressions_min != null ? String(ad.impressions_min) : '',
    ad.impressions_max != null ? String(ad.impressions_max) : '',
    ad.funding_entity || '',
    ad.ad_snapshot_url || '',
    ad.country || '',
    ad.language || '',
    ad.scraped_at,
    // "See ad details" / EU transparency
    ad.detail_fetched ? 'yes' : '',
    ad.total_reach != null ? String(ad.total_reach) : '',
    ad.beneficiary || '',
    ad.payer || '',
    ad.region_distribution?.length
      ? ad.region_distribution.slice(0, 5).map((r) => `${r.region} ${r.percentage}%`).join('; ')
      : '',
    ad.demographic_distribution?.length
      ? ad.demographic_distribution.slice(0, 8).map((d) => `${d.age ?? ''}/${d.gender ?? ''} ${d.percentage}%`).join('; ')
      : '',
  ];
  return fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(',');
}

export function adsToCsv(ads: Ad[]): string {
  return BOM + [AD_CSV_HEADER, ...ads.map(adToCsvRow)].join('\n');
}

// Builds a safe, identifying download filename: <base>_<label>_<YYYY-MM-DD_HHmm>.csv
export function exportFilename(base: string, label?: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const slug = (label || '').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return [base, slug, stamp].filter(Boolean).join('_') + '.csv';
}
