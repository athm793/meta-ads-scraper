import dns from 'node:dns/promises';
import net from 'node:net';
import { launchBrowser, createContext, closeBrowser } from './browser';

// ---------------------------------------------------------------------------
// Resolve a brand's Facebook / Instagram handles from its website.
//
// This is the deterministic key for bulk brand matching: a brand's own site
// almost always links to its real FB/IG in the footer, and Meta's typeahead
// returns each page's FB handle (page_alias). Matching the two is an identity
// check, not a name guess.
//
// Two tiers: a fast plain HTTP fetch, then a Playwright render fallback for
// JS-injected footers / Cloudflare. No third-party APIs. Server-only.
// ---------------------------------------------------------------------------

export interface SiteHandles {
  facebook?: string;   // normalized FB handle, e.g. "snitch.co.in"
  instagram?: string;  // normalized IG username, e.g. "snitch.in"
  fetched: boolean;    // true if any tier got HTML (distinguishes "no handles" from "couldn't fetch")
  via: 'fetch' | 'browser' | null;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_BYTES = 1_000_000; // ~1MB body cap — footer links are always near the top anyway

/** "snitch.co.in" / "www.x.com" / "https://x.com/path" -> a normalized https URL, or null. */
export function normalizeDomainToUrl(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ---- SSRF guard ----

function ipIsPrivate(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;        // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipIsPrivate(mapped[1]);
    return false;
  }
  return false;
}

/** Reject localhost, internal TLDs, and hosts that resolve to private/reserved IPs. */
export async function isPublicHttpUrl(url: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;

  // Literal IP host
  if (net.isIP(host)) return !ipIsPrivate(host);

  // Resolve and validate every address the host maps to
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) return false;
    return records.every((r) => !ipIsPrivate(r.address));
  } catch {
    return false; // DNS failure -> treat as unreachable
  }
}

// ---- handle extraction ----

const FB_RE = /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook|fb)\.com\/([^\s"'<>?#/]+)/gi;
const IG_RE = /https?:\/\/(?:www\.)?instagram\.com\/([^\s"'<>?#/]+)/gi;

// First-path-segment values that are NOT brand profiles.
const FB_REJECT = new Set([
  'sharer', 'sharer.php', 'plugins', 'tr', 'tr.php', 'events', 'event.php', 'groups', 'group.php',
  'pages', 'marketplace', 'watch', 'gaming', 'help', 'policies', 'login', 'login.php', 'dialog',
  'permalink.php', 'story.php', 'photo.php', 'photo', 'hashtag', 'people', 'public', 'l.php', 'flx',
  'ajax', 'home.php', 'recover', 'reg', 'privacy', 'about', 'careers', 'business',
]);
const IG_REJECT = new Set([
  'p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'stories', 'direct', 'about', 'developer',
  'legal', 'privacy', 'tags', 'web', 'challenge', 'emails', 'session',
]);
const GENERIC = new Set(['facebook', 'instagram', 'meta', 'share', 'home', 'intent', 'profile']);

function cleanSegment(seg: string): string | null {
  let s = seg.trim().toLowerCase();
  s = s.replace(/^@/, '').replace(/\/+$/, '');
  if (!s || s.length < 2 || s.length > 80) return null;
  if (GENERIC.has(s)) return null;
  return s;
}

export function extractHandlesFromHtml(html: string): { facebook?: string; instagram?: string } {
  const out: { facebook?: string; instagram?: string } = {};

  for (const m of html.matchAll(FB_RE)) {
    const raw = m[1].toLowerCase();
    // profile.php?id=NNN — keep the numeric id (comparable to a numeric page id)
    if (raw.startsWith('profile.php')) {
      const id = m[0].match(/[?&]id=(\d{6,})/i);
      if (id) { out.facebook = id[1]; break; }
      continue;
    }
    if (FB_REJECT.has(raw)) continue;
    const h = cleanSegment(raw);
    if (h) { out.facebook = h; break; }
  }

  for (const m of html.matchAll(IG_RE)) {
    const raw = m[1].toLowerCase();
    if (IG_REJECT.has(raw)) continue;
    const h = cleanSegment(raw);
    if (h) { out.instagram = h; break; }
  }

  return out;
}

// ---- fetch tiers ----

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (received > MAX_BYTES) { await reader.cancel().catch(() => {}); break; }
    }
  }
  const buf = new Uint8Array(received > MAX_BYTES ? MAX_BYTES : received);
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, buf.length - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

async function tierFetch(url: string, timeoutMs: number): Promise<{ facebook?: string; instagram?: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    // A redirect can land on a private host — re-validate the final URL.
    if (res.url && res.url !== url && !(await isPublicHttpUrl(res.url))) return null;
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ct)) return null;
    const html = await readCapped(res);
    return extractHandlesFromHtml(html);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function tierBrowser(url: string): Promise<{ facebook?: string; instagram?: string } | null> {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    browser = await launchBrowser(true);
    const ctx = await createContext(browser);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    const html = await page.content();
    return extractHandlesFromHtml(html);
  } catch {
    return null;
  } finally {
    await closeBrowser(browser);
  }
}

/**
 * Resolve FB/IG handles from a brand domain. Tier 1 is a plain fetch; Tier 2
 * renders with Playwright when Tier 1 fails or finds nothing. Never throws.
 */
export async function resolveSiteHandles(
  rawDomain: string,
  opts: { timeoutMs?: number; allowBrowser?: boolean } = {}
): Promise<SiteHandles> {
  const { timeoutMs = 6000, allowBrowser = true } = opts;
  const url = normalizeDomainToUrl(rawDomain);
  if (!url || !(await isPublicHttpUrl(url))) return { fetched: false, via: null };

  const t1 = await tierFetch(url, timeoutMs);
  if (t1 && (t1.facebook || t1.instagram)) {
    return { facebook: t1.facebook, instagram: t1.instagram, fetched: true, via: 'fetch' };
  }

  if (allowBrowser) {
    const t2 = await tierBrowser(url);
    if (t2 && (t2.facebook || t2.instagram)) {
      return { facebook: t2.facebook, instagram: t2.instagram, fetched: true, via: 'browser' };
    }
    // Browser reached the page but found nothing -> fetched true, no handles.
    if (t1 !== null || t2 !== null) return { fetched: true, via: null };
    return { fetched: false, via: null };
  }

  return { fetched: t1 !== null, via: null };
}

/** Normalize a handle for exact comparison (lowercase, strip @ and trailing slash). */
export function normHandle(s?: string): string {
  return (s || '').trim().toLowerCase().replace(/^@/, '').replace(/\/+$/, '');
}
