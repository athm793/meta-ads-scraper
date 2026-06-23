import type { Ad } from '@/types/ads';

function slug(s: string): string {
  return (s || 'ad').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ad';
}

function extFor(url: string, type: string): string {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,4})$/i);
    if (m) return m[1].toLowerCase();
  } catch { /* ignore */ }
  if (/mp4|video/.test(type)) return 'mp4';
  if (/png/.test(type)) return 'png';
  if (/webp/.test(type)) return 'webp';
  if (/gif/.test(type)) return 'gif';
  return 'jpg';
}

async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(`/api/download?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  return r.blob();
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Meta CDN hosts whose media should be displayed via our same-origin proxy
// (avoids ad-blockers and any direct-load quirk; mirrors the /api/download allowlist).
const PROXY_HOST = /(^|\.)(fbcdn\.net|cdninstagram\.com|fbsbx\.com|facebook\.com)$/i;

/** Returns a src usable in <img>/<video> — proxied through /api/download for Meta CDN. */
export function mediaSrc(url?: string): string {
  if (!url) return '';
  try {
    if (PROXY_HOST.test(new URL(url).hostname)) {
      return `/api/download?inline=1&url=${encodeURIComponent(url)}`;
    }
  } catch { /* fall through */ }
  return url;
}

// Collect every distinct media URL on an ad (videos first, then images/cards)
export function adMediaUrls(ad: Ad): Array<{ url: string; kind: 'video' | 'image' }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; kind: 'video' | 'image' }> = [];
  const add = (url: string | undefined, kind: 'video' | 'image') => {
    if (url && !seen.has(url)) { seen.add(url); out.push({ url, kind }); }
  };
  ad.video_urls?.forEach((u) => add(u, 'video'));
  ad.carousel_cards?.forEach((c) => { add(c.video_url, 'video'); add(c.image_url, 'image'); });
  ad.media_urls?.forEach((u) => add(u, 'image'));
  return out;
}

/** Downloads one specific media URL (e.g. the video/image being viewed). */
export async function downloadSingleUrl(ad: Ad, url: string): Promise<void> {
  if (!url) return;
  const blob = await fetchBlob(url);
  triggerDownload(blob, `${slug(ad.advertiser_name)}_${ad.id}.${extFor(url, blob.type)}`);
}

/**
 * Downloads an ad's media. A single asset downloads directly; multiple assets
 * are bundled into a zip. Files are named <advertiser>_<id>[_n].<ext>.
 */
export async function downloadAdMedia(ad: Ad): Promise<void> {
  const items = adMediaUrls(ad);
  if (items.length === 0) return;
  const base = `${slug(ad.advertiser_name)}_${ad.id}`;

  if (items.length === 1) {
    const blob = await fetchBlob(items[0].url);
    triggerDownload(blob, `${base}.${extFor(items[0].url, blob.type)}`);
    return;
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let n = 0;
  await Promise.all(
    items.map(async (item) => {
      try {
        const blob = await fetchBlob(item.url);
        zip.file(`${base}_${++n}.${extFor(item.url, blob.type)}`, blob);
      } catch { /* skip individual failures */ }
    })
  );
  if (Object.keys(zip.files).length === 0) return;
  triggerDownload(await zip.generateAsync({ type: 'blob' }), `${base}.zip`);
}
