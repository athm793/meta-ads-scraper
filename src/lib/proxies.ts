import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Optional proxy rotation
//
// Fully opt-in. With no proxies configured, the scraper connects directly
// exactly as before. To spread load across IPs (the real defence for heavy
// use), supply proxies via either:
//   - env  META_SCRAPER_PROXIES = comma-separated list
//   - file data/proxies.txt      = one proxy per line (# comments allowed)
//
// Each entry: [scheme://][user:pass@]host:port  (scheme defaults to http).
// Proxies are handed out round-robin per browser context.
// ---------------------------------------------------------------------------

export interface ProxySetting {
  server: string;
  username?: string;
  password?: string;
}

let pool: string[] | null = null;
let idx = 0;

function load(): string[] {
  if (pool) return pool;
  const out: string[] = [];

  const env = process.env.META_SCRAPER_PROXIES;
  if (env) out.push(...env.split(',').map((s) => s.trim()).filter(Boolean));

  try {
    const file = path.join(process.cwd(), 'data', 'proxies.txt');
    if (fs.existsSync(file)) {
      out.push(
        ...fs.readFileSync(file, 'utf8')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
      );
    }
  } catch { /* no file is fine */ }

  pool = out;
  if (out.length) console.log(`[proxies] ${out.length} proxy(ies) loaded — rotating round-robin`);
  return pool;
}

export function hasProxies(): boolean {
  return load().length > 0;
}

function parseProxy(raw: string): ProxySetting {
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
    const res: ProxySetting = { server: `${u.protocol}//${u.host}` };
    if (u.username) res.username = decodeURIComponent(u.username);
    if (u.password) res.password = decodeURIComponent(u.password);
    return res;
  } catch {
    // Fall back to treating the whole string as the server address
    return { server: raw.includes('://') ? raw : `http://${raw}` };
  }
}

/** Next proxy in rotation, or undefined when none are configured (direct connect). */
export function nextProxy(): ProxySetting | undefined {
  const p = load();
  if (!p.length) return undefined;
  const raw = p[idx % p.length];
  idx += 1;
  return parseProxy(raw);
}
