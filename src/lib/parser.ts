import type { Ad, CarouselCard, DemographicEntry, MediaType, Platform, RegionEntry } from '@/types/ads';
import { differenceInDays, parseISO } from 'date-fns';

function deepFind(obj: unknown, key: string): unknown[] {
  const results: unknown[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    if (key in record) results.push(record[key]);
    for (const v of Object.values(record)) walk(v);
  }
  walk(obj);
  return results;
}

function extractAdNodes(json: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];

  const ids = deepFind(json, 'ad_archive_id');
  if (ids.length > 0) {
    function collectParents(node: unknown, depth = 0): void {
      if (!node || typeof node !== 'object' || depth > 20) return;
      if (Array.isArray(node)) {
        node.forEach((n) => collectParents(n, depth + 1));
        return;
      }
      const rec = node as Record<string, unknown>;
      if ('ad_archive_id' in rec) {
        nodes.push(rec);
        return;
      }
      for (const v of Object.values(rec)) collectParents(v, depth + 1);
    }
    collectParents(json);
  }

  return nodes;
}

function toStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((v) => typeof v === 'string');
  if (typeof val === 'string') return [val];
  return [];
}

function inferMediaType(node: Record<string, unknown>): MediaType {
  const snapshot = node.snapshot as Record<string, unknown> | undefined;
  if (snapshot) {
    const cards = snapshot.cards as unknown[] | undefined;
    if (cards && cards.length > 1) return 'carousel';
    const videos = snapshot.videos as unknown[] | undefined;
    if (videos && videos.length > 1) return 'multi_video';
    if (videos && videos.length > 0) return 'video';
    const images = snapshot.images as unknown[] | undefined;
    if (images && images.length > 0) return 'image';
  }
  const type = (node.ad_creative_media_type as string | undefined)?.toLowerCase();
  if (type === 'video') return 'video';
  if (type === 'carousel') return 'carousel';
  if (type === 'image') return 'image';
  const bodies = toStringArray(node.ad_creative_bodies);
  if (bodies.length === 0 && !snapshot) return 'unknown';
  return 'image';
}

function extractMediaUrls(node: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const snapshot = node.snapshot as Record<string, unknown> | undefined;
  if (!snapshot) return urls;

  const images = snapshot.images as Array<Record<string, unknown>> | undefined;
  images?.forEach((img) => {
    const url = img.resized_image_url || img.original_image_url || img.url;
    if (typeof url === 'string') urls.push(url);
  });

  const videos = snapshot.videos as Array<Record<string, unknown>> | undefined;
  videos?.forEach((vid) => {
    const url = vid.video_hd_url || vid.video_sd_url || vid.video_preview_image_url;
    if (typeof url === 'string') urls.push(url);
  });

  const cards = snapshot.cards as Array<Record<string, unknown>> | undefined;
  cards?.forEach((card) => {
    const imgUrl = card.resized_image_url || card.original_image_url;
    const vidUrl = card.video_hd_url || card.video_sd_url;
    if (typeof imgUrl === 'string') urls.push(imgUrl);
    if (typeof vidUrl === 'string') urls.push(vidUrl);
  });

  return [...new Set(urls)];
}

function extractCarouselCards(node: Record<string, unknown>): CarouselCard[] {
  const snapshot = node.snapshot as Record<string, unknown> | undefined;
  if (!snapshot) return [];
  const cards = snapshot.cards as Array<Record<string, unknown>> | undefined;
  if (!cards) return [];

  return cards.map((card) => ({
    title: typeof card.title === 'string' ? card.title : undefined,
    body: typeof card.body === 'string' ? card.body : undefined,
    link_url: typeof card.link_url === 'string' ? card.link_url : undefined,
    image_url:
      typeof card.resized_image_url === 'string'
        ? card.resized_image_url
        : typeof card.original_image_url === 'string'
          ? card.original_image_url
          : undefined,
    video_url:
      typeof card.video_hd_url === 'string'
        ? card.video_hd_url
        : typeof card.video_sd_url === 'string'
          ? card.video_sd_url
          : undefined,
    cta_text: typeof card.cta_text === 'string' ? card.cta_text : undefined,
  }));
}

function extractPlatforms(node: Record<string, unknown>): Platform[] {
  // Field is 'publisher_platforms' (plural) in some responses, 'publisher_platform' (singular) in others
  const raw = node.publisher_platforms || node.publisher_platform || node.platforms;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const map: Record<string, Platform> = {
    facebook: 'FACEBOOK',
    instagram: 'INSTAGRAM',
    audience_network: 'AUDIENCE_NETWORK',
    messenger: 'MESSENGER',
  };
  return arr.map((p) => map[String(p).toLowerCase()]).filter(Boolean) as Platform[];
}

function extractDemographics(node: Record<string, unknown>): DemographicEntry[] {
  const dist = node.demographic_distribution as Array<Record<string, unknown>> | undefined;
  if (!dist) return [];
  return dist.map((d) => ({
    age: typeof d.age === 'string' ? d.age : undefined,
    gender: typeof d.gender === 'string' ? d.gender : undefined,
    percentage: parseFloat(String(d.percentage || 0)),
  }));
}

function extractRegions(node: Record<string, unknown>): RegionEntry[] {
  const dist = node.region_distribution as Array<Record<string, unknown>> | undefined;
  if (!dist) return [];
  return dist.map((d) => ({
    region: String(d.region || d.name || ''),
    percentage: parseFloat(String(d.percentage || 0)),
  }));
}

function toIso(val: unknown): string | undefined {
  if (!val) return undefined;
  const s = String(val);
  // Already ISO
  if (s.includes('T') || s.includes('-')) return s;
  // Unix timestamp (seconds)
  const n = Number(s);
  if (!isNaN(n) && n > 1e9) return new Date(n * 1000).toISOString();
  return s;
}

function extractBodies(node: Record<string, unknown>): string[] {
  // ad_creative_bodies is the standard field from GraphQL API responses
  const direct = toStringArray(node.ad_creative_bodies);
  if (direct.length > 0) return direct;

  // In SSR HTML responses, body text lives inside snapshot
  const snapshot = node.snapshot as Record<string, unknown> | undefined;
  if (!snapshot) return [];

  // snapshot.body for single-creative ads
  if (typeof snapshot.body === 'string' && snapshot.body) return [snapshot.body];

  // snapshot.cards[].body for carousel/multi-creative
  const cards = snapshot.cards as Array<Record<string, unknown>> | undefined;
  if (cards) {
    const bodies = cards
      .map((c) => (typeof c.body === 'string' ? c.body : ''))
      .filter(Boolean);
    if (bodies.length > 0) return [...new Set(bodies)];
  }

  return [];
}

export function parseAdNode(node: Record<string, unknown>, jobId?: string): Ad {
  const snapshot = node.snapshot as Record<string, unknown> | undefined;

  // Date fields: GraphQL uses ad_delivery_start_time, SSR HTML uses start_date
  const startTime = toIso(node.ad_delivery_start_time ?? node.start_date);
  const stopTime = toIso(node.ad_delivery_stop_time ?? node.end_date);

  let daysRunning: number | undefined;
  if (startTime) {
    try {
      const start = parseISO(startTime);
      const end = stopTime ? parseISO(stopTime) : new Date();
      daysRunning = Math.max(0, differenceInDays(end, start));
    } catch {
      daysRunning = undefined;
    }
  }

  const spend = node.spend as Record<string, unknown> | undefined;
  const impressions = node.impressions as Record<string, unknown> | undefined;

  const bylines = node.bylines as Array<Record<string, unknown>> | undefined;
  const fundingEntity =
    (bylines?.[0]?.name as string | undefined) ||
    (typeof snapshot?.byline === 'string' ? snapshot.byline : undefined);

  // CTA: try snapshot directly, then snapshot.cards[0]
  const cards = snapshot?.cards as Array<Record<string, unknown>> | undefined;
  const ctaText =
    (snapshot?.cta_text as string | undefined) ||
    (cards?.[0]?.cta_text as string | undefined) ||
    (snapshot?.call_to_action_type as string | undefined);

  // Link URL: try snapshot directly, then first card
  const linkUrl =
    (snapshot?.link_url as string | undefined) ||
    (snapshot?.website_url as string | undefined) ||
    (cards?.[0]?.link_url as string | undefined);

  // Headline: try standard field, then snapshot caption, then first card title
  const headline =
    toStringArray(node.ad_creative_link_titles)[0] ||
    (typeof snapshot?.caption === 'string' ? snapshot.caption : undefined) ||
    (cards?.[0]?.title as string | undefined);

  // Page name can live at top level or inside snapshot
  const advertiserName =
    String(node.page_name || snapshot?.page_name || node.advertiser_name || 'Unknown');

  return {
    id: String(node.ad_archive_id || node.id || ''),
    advertiser_name: advertiserName,
    advertiser_page_id: node.page_id ? String(node.page_id) : undefined,
    body_variants: extractBodies(node),
    headline,
    cta_text: ctaText,
    link_url: linkUrl,
    media_type: inferMediaType(node),
    media_urls: extractMediaUrls(node),
    carousel_cards: extractCarouselCards(node),
    platforms: extractPlatforms(node),
    status: node.is_active ? 'ACTIVE' : 'INACTIVE',
    category: 'ALL',
    started_at: startTime,
    stopped_at: stopTime,
    days_running: daysRunning,
    language: node.languages ? String(toStringArray(node.languages)[0] || '') : undefined,
    spend_min: spend?.lower_bound ? Number(spend.lower_bound) : undefined,
    spend_max: spend?.upper_bound ? Number(spend.upper_bound) : undefined,
    spend_currency: spend?.currency
      ? String(spend.currency)
      : node.currency
        ? String(node.currency)
        : undefined,
    impressions_min: impressions?.lower_bound ? Number(impressions.lower_bound) : undefined,
    impressions_max: impressions?.upper_bound ? Number(impressions.upper_bound) : undefined,
    funding_entity: fundingEntity,
    demographic_distribution: extractDemographics(node),
    region_distribution: extractRegions(node),
    ad_snapshot_url: node.ad_snapshot_url
      ? String(node.ad_snapshot_url)
      : `https://www.facebook.com/ads/library/?id=${node.ad_archive_id}`,
    saved: false,
    scraped_at: new Date().toISOString(),
    scrape_job_id: jobId,
  };
}

export function parseGraphQLResponse(json: unknown, jobId?: string): Ad[] {
  try {
    const nodes = extractAdNodes(json);
    const seen = new Set<string>();
    const ads: Ad[] = [];

    for (const node of nodes) {
      if (!node.ad_archive_id) continue;
      const id = String(node.ad_archive_id);
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        ads.push(parseAdNode(node, jobId));
      } catch (e) {
        console.error('Failed to parse ad node:', e);
      }
    }

    return ads;
  } catch (e) {
    console.error('Failed to parse GraphQL response:', e);
    return [];
  }
}
