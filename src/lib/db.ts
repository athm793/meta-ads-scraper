import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  Ad,
  Collection,
  Tag,
  ScrapeJob,
  BulkJob,
  BulkCompany,
  SearchParams,
  AdScopeFilters,
  WebhookConfig,
  SearchSession,
  SessionFireOn,
} from '@/types/ads';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'ads.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ads (
      id TEXT PRIMARY KEY,
      advertiser_name TEXT NOT NULL,
      advertiser_page_id TEXT,
      body_variants TEXT DEFAULT '[]',
      headline TEXT,
      cta_text TEXT,
      link_url TEXT,
      media_type TEXT DEFAULT 'unknown',
      media_urls TEXT DEFAULT '[]',
      video_urls TEXT DEFAULT '[]',
      carousel_cards TEXT DEFAULT '[]',
      platforms TEXT DEFAULT '[]',
      status TEXT DEFAULT 'INACTIVE',
      category TEXT DEFAULT 'ALL',
      started_at TEXT,
      stopped_at TEXT,
      days_running INTEGER,
      country TEXT,
      language TEXT,
      spend_min INTEGER,
      spend_max INTEGER,
      spend_currency TEXT,
      impressions_min INTEGER,
      impressions_max INTEGER,
      funding_entity TEXT,
      demographic_distribution TEXT DEFAULT '[]',
      region_distribution TEXT DEFAULT '[]',
      ad_snapshot_url TEXT,
      saved INTEGER DEFAULT 0,
      collection_id TEXT,
      session_id TEXT,
      scraped_at TEXT,
      scrape_job_id TEXT
    );

    CREATE TABLE IF NOT EXISTS search_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      webhook_url TEXT,
      webhook_secret TEXT,
      webhook_enabled INTEGER DEFAULT 0,
      fire_on TEXT DEFAULT 'save',
      created_at TEXT,
      last_activity TEXT
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ad_tags (
      ad_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (ad_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ad_tags_tag ON ad_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_ad_tags_ad ON ad_tags(ad_id);

    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id TEXT PRIMARY KEY,
      params TEXT DEFAULT '{}',
      started_at TEXT,
      completed_at TEXT,
      total_found INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at TEXT,
      status TEXT DEFAULT 'queued',
      total_companies INTEGER DEFAULT 0,
      completed_companies INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bulk_job_companies (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES bulk_jobs(id),
      company_name TEXT,
      website TEXT,
      status TEXT DEFAULT 'pending',
      active_ads_count INTEGER DEFAULT 0,
      inactive_ads_count INTEGER DEFAULT 0,
      ad_types TEXT DEFAULT '[]',
      platforms TEXT DEFAULT '[]',
      spend_range TEXT,
      last_ad_date TEXT,
      scraped_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ads_advertiser ON ads(advertiser_name);
    CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
    CREATE INDEX IF NOT EXISTS idx_ads_scraped ON ads(scraped_at);
    CREATE INDEX IF NOT EXISTS idx_ads_job ON ads(scrape_job_id);
    CREATE INDEX IF NOT EXISTS idx_bulk_companies_job ON bulk_job_companies(job_id);
  `);

  // Additive migrations — safe to run every startup
  const existingCols = (db.pragma('table_info(ads)') as { name: string }[]).map((c) => c.name);
  if (!existingCols.includes('video_urls')) {
    db.exec(`ALTER TABLE ads ADD COLUMN video_urls TEXT DEFAULT '[]'`);
  }
  const deepCols: Array<[string, string]> = [
    ['deep_search_done', 'INTEGER DEFAULT 0'],
    ['targeting_age_min', 'INTEGER'],
    ['targeting_age_max', 'INTEGER'],
    ['targeting_gender', 'TEXT'],
    ['targeting_locations', "TEXT DEFAULT '[]'"],
    ['targeting_interests', "TEXT DEFAULT '[]'"],
    ['policy_status', 'TEXT'],
    ['detail_fetched', 'INTEGER DEFAULT 0'],
    ['total_reach', 'INTEGER'],
    ['beneficiary', 'TEXT'],
    ['payer', 'TEXT'],
  ];
  for (const [col, def] of deepCols) {
    if (!existingCols.includes(col)) {
      db.exec(`ALTER TABLE ads ADD COLUMN ${col} ${def}`);
    }
  }
  if (!existingCols.includes('session_id')) {
    db.exec(`ALTER TABLE ads ADD COLUMN session_id TEXT`);
  }
  // Created after the column is guaranteed to exist (fresh table or migrated).
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ads_session ON ads(session_id)`);

  const bulkCols = (db.pragma('table_info(bulk_jobs)') as { name: string }[]).map((c) => c.name);
  if (!bulkCols.includes('archived')) {
    db.exec(`ALTER TABLE bulk_jobs ADD COLUMN archived INTEGER DEFAULT 0`);
  }
  if (!bulkCols.includes('filters')) {
    db.exec(`ALTER TABLE bulk_jobs ADD COLUMN filters TEXT DEFAULT '{}'`);
  }
  if (!bulkCols.includes('webhook_url')) db.exec(`ALTER TABLE bulk_jobs ADD COLUMN webhook_url TEXT`);
  if (!bulkCols.includes('webhook_secret')) db.exec(`ALTER TABLE bulk_jobs ADD COLUMN webhook_secret TEXT`);
  if (!bulkCols.includes('webhook_enabled')) db.exec(`ALTER TABLE bulk_jobs ADD COLUMN webhook_enabled INTEGER DEFAULT 0`);

  const companyCols = (db.pragma('table_info(bulk_job_companies)') as { name: string }[]).map((c) => c.name);
  if (!companyCols.includes('category')) db.exec(`ALTER TABLE bulk_job_companies ADD COLUMN category TEXT`);
  if (!companyCols.includes('matched_name')) db.exec(`ALTER TABLE bulk_job_companies ADD COLUMN matched_name TEXT`);
  if (!companyCols.includes('matched_page_id')) db.exec(`ALTER TABLE bulk_job_companies ADD COLUMN matched_page_id TEXT`);
  if (!companyCols.includes('fb_handle')) db.exec(`ALTER TABLE bulk_job_companies ADD COLUMN fb_handle TEXT`);
  if (!companyCols.includes('ig_handle')) db.exec(`ALTER TABLE bulk_job_companies ADD COLUMN ig_handle TEXT`);
  if (!companyCols.includes('match_method')) db.exec(`ALTER TABLE bulk_job_companies ADD COLUMN match_method TEXT`);
}

export function upsertAd(ad: Ad) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO ads (
      id, advertiser_name, advertiser_page_id, body_variants, headline,
      cta_text, link_url, media_type, media_urls, video_urls, carousel_cards, platforms,
      status, category, started_at, stopped_at, days_running, country, language,
      spend_min, spend_max, spend_currency, impressions_min, impressions_max,
      funding_entity, demographic_distribution, region_distribution,
      ad_snapshot_url, saved, collection_id, session_id, scraped_at, scrape_job_id,
      deep_search_done, targeting_age_min, targeting_age_max, targeting_gender,
      targeting_locations, targeting_interests, policy_status,
      detail_fetched, total_reach, beneficiary, payer
    ) VALUES (
      @id, @advertiser_name, @advertiser_page_id, @body_variants, @headline,
      @cta_text, @link_url, @media_type, @media_urls, @video_urls, @carousel_cards, @platforms,
      @status, @category, @started_at, @stopped_at, @days_running, @country, @language,
      @spend_min, @spend_max, @spend_currency, @impressions_min, @impressions_max,
      @funding_entity, @demographic_distribution, @region_distribution,
      @ad_snapshot_url, @saved, @collection_id, @session_id, @scraped_at, @scrape_job_id,
      @deep_search_done, @targeting_age_min, @targeting_age_max, @targeting_gender,
      @targeting_locations, @targeting_interests, @policy_status,
      @detail_fetched, @total_reach, @beneficiary, @payer
    )
  `).run({
    ...ad,
    body_variants: JSON.stringify(ad.body_variants),
    media_urls: JSON.stringify(ad.media_urls),
    video_urls: JSON.stringify(ad.video_urls ?? []),
    carousel_cards: JSON.stringify(ad.carousel_cards),
    platforms: JSON.stringify(ad.platforms),
    demographic_distribution: JSON.stringify(ad.demographic_distribution),
    region_distribution: JSON.stringify(ad.region_distribution),
    saved: ad.saved ? 1 : 0,
    advertiser_page_id: ad.advertiser_page_id ?? null,
    session_id: ad.session_id ?? null,
    headline: ad.headline ?? null,
    cta_text: ad.cta_text ?? null,
    link_url: ad.link_url ?? null,
    started_at: ad.started_at ?? null,
    stopped_at: ad.stopped_at ?? null,
    days_running: ad.days_running ?? null,
    country: ad.country ?? null,
    language: ad.language ?? null,
    spend_min: ad.spend_min ?? null,
    spend_max: ad.spend_max ?? null,
    spend_currency: ad.spend_currency ?? null,
    impressions_min: ad.impressions_min ?? null,
    impressions_max: ad.impressions_max ?? null,
    funding_entity: ad.funding_entity ?? null,
    ad_snapshot_url: ad.ad_snapshot_url ?? null,
    collection_id: ad.collection_id ?? null,
    scrape_job_id: ad.scrape_job_id ?? null,
    deep_search_done: ad.deep_search_done ? 1 : 0,
    targeting_age_min: ad.targeting_age_min ?? null,
    targeting_age_max: ad.targeting_age_max ?? null,
    targeting_gender: ad.targeting_gender ?? null,
    targeting_locations: JSON.stringify(ad.targeting_locations ?? []),
    targeting_interests: JSON.stringify(ad.targeting_interests ?? []),
    policy_status: ad.policy_status ?? null,
    detail_fetched: ad.detail_fetched ? 1 : 0,
    total_reach: ad.total_reach ?? null,
    beneficiary: ad.beneficiary ?? null,
    payer: ad.payer ?? null,
  });
}

function rowToAd(row: Record<string, unknown>): Ad {
  return {
    ...(row as Omit<Ad, 'body_variants' | 'media_urls' | 'carousel_cards' | 'platforms' | 'demographic_distribution' | 'region_distribution' | 'saved' | 'targeting_locations' | 'targeting_interests'>),
    body_variants: JSON.parse(String(row.body_variants || '[]')),
    media_urls: JSON.parse(String(row.media_urls || '[]')),
    video_urls: JSON.parse(String(row.video_urls || '[]')),
    carousel_cards: JSON.parse(String(row.carousel_cards || '[]')),
    platforms: JSON.parse(String(row.platforms || '[]')),
    demographic_distribution: JSON.parse(String(row.demographic_distribution || '[]')),
    region_distribution: JSON.parse(String(row.region_distribution || '[]')),
    targeting_locations: JSON.parse(String(row.targeting_locations || '[]')),
    targeting_interests: JSON.parse(String(row.targeting_interests || '[]')),
    saved: row.saved === 1,
    deep_search_done: row.deep_search_done === 1,
    detail_fetched: row.detail_fetched === 1,
  };
}

export function queryAds(params: {
  search?: string;
  advertiser?: string;
  status?: string;
  saved?: boolean;
  collection_id?: string;
  session_id?: string;
  tag_id?: string;
  job_id?: string;
  page?: number;
  limit?: number;
  sort?: string;
}): { ads: Ad[]; total: number } {
  const db = getDb();
  const { page = 1, limit = 24, sort = 'scraped_at' } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const bindings: Record<string, unknown> = {};

  if (params.search) {
    conditions.push(`(advertiser_name LIKE @search OR body_variants LIKE @search OR headline LIKE @search)`);
    bindings.search = `%${params.search}%`;
  }
  if (params.advertiser) {
    conditions.push(`advertiser_name LIKE @advertiser`);
    bindings.advertiser = `%${params.advertiser}%`;
  }
  if (params.status && params.status !== 'ALL') {
    conditions.push(`status = @status`);
    bindings.status = params.status;
  }
  if (params.saved !== undefined) {
    conditions.push(`saved = @saved`);
    bindings.saved = params.saved ? 1 : 0;
  }
  if (params.collection_id) {
    conditions.push(`collection_id = @collection_id`);
    bindings.collection_id = params.collection_id;
  }
  if (params.session_id) {
    conditions.push(`session_id = @session_id`);
    bindings.session_id = params.session_id;
  }
  if (params.tag_id) {
    conditions.push(`id IN (SELECT ad_id FROM ad_tags WHERE tag_id = @tag_id)`);
    bindings.tag_id = params.tag_id;
  }
  if (params.job_id) {
    conditions.push(`scrape_job_id = @job_id`);
    bindings.job_id = params.job_id;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts: Record<string, string> = {
    scraped_at: 'scraped_at DESC',
    days_running: 'days_running DESC',
    started_at: 'started_at DESC',
    advertiser_name: 'advertiser_name ASC',
  };
  const orderBy = allowedSorts[sort] || 'scraped_at DESC';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM ads ${where}`).get(bindings) as { count: number }).count;
  const rows = db.prepare(`SELECT * FROM ads ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`).all(bindings) as Record<string, unknown>[];

  const ads = rows.map(rowToAd);
  attachTags(ads);
  return { ads, total };
}

// Lightweight pull of first-line + timestamp for hook trend analysis
export function getHookSamples(): Array<{ body_variants: string; scraped_at: string; started_at: string | null }> {
  const db = getDb();
  return db.prepare(
    `SELECT body_variants, scraped_at, started_at FROM ads WHERE body_variants IS NOT NULL AND body_variants != '[]'`
  ).all() as Array<{ body_variants: string; scraped_at: string; started_at: string | null }>;
}

export function getAdById(id: string): Ad | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ads WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToAd(row) : null;
}

export function setAdSaved(id: string, saved: boolean, collectionId?: string) {
  const db = getDb();
  db.prepare('UPDATE ads SET saved = ?, collection_id = ? WHERE id = ?').run(saved ? 1 : 0, collectionId ?? null, id);
}

export function getAdsByAdvertiser(advertiserName: string): Ad[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ads WHERE advertiser_name LIKE ? ORDER BY scraped_at DESC').all(`%${advertiserName}%`) as Record<string, unknown>[];
  return rows.map(rowToAd);
}

export function getPreviousJobAds(advertiserName: string, currentJobId: string): Set<string> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id FROM ads WHERE advertiser_name LIKE ? AND scrape_job_id != ?
  `).all(`%${advertiserName}%`, currentJobId) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

// Collections
export function getCollections(): Collection[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.*, COUNT(a.id) as ad_count
    FROM collections c
    LEFT JOIN ads a ON a.collection_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all() as Record<string, unknown>[];
  return rows as unknown as Collection[];
}

export function createCollection(name: string, color?: string): Collection {
  const db = getDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.prepare('INSERT INTO collections (id, name, created_at, color) VALUES (?, ?, ?, ?)').run(id, name, created_at, color ?? null);
  return { id, name, created_at, color };
}

export function deleteCollection(id: string) {
  const db = getDb();
  db.prepare('UPDATE ads SET collection_id = NULL WHERE collection_id = ?').run(id);
  db.prepare('DELETE FROM collections WHERE id = ?').run(id);
}

// Search sessions — named containers on the Search page, each with its own
// optional outbound webhook. Ads scraped while a session is active are stamped
// with its id (ads.session_id) so a session's set can be queried/exported later.
function rowToSession(row: Record<string, unknown> | undefined): SearchSession | null {
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    webhook_url: (row.webhook_url as string) ?? undefined,
    webhook_secret: (row.webhook_secret as string) ?? undefined,
    webhook_enabled: row.webhook_enabled === 1,
    fire_on: (row.fire_on as SessionFireOn) || 'save',
    created_at: String(row.created_at),
    last_activity: (row.last_activity as string) ?? undefined,
    ad_count: typeof row.ad_count === 'number' ? row.ad_count : undefined,
  };
}

export function listSearchSessions(): SearchSession[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.*, COUNT(a.id) as ad_count
    FROM search_sessions s
    LEFT JOIN ads a ON a.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all() as Record<string, unknown>[];
  return rows.map((r) => rowToSession(r)!).filter(Boolean);
}

export function getSearchSession(id: string): SearchSession | null {
  const db = getDb();
  return rowToSession(db.prepare('SELECT * FROM search_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined);
}

export function createSearchSession(input: {
  name: string;
  webhook_url?: string;
  webhook_secret?: string;
  webhook_enabled?: boolean;
  fire_on?: SessionFireOn;
}): SearchSession {
  const db = getDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  // webhook_enabled is derived: a session "has a webhook" iff it has a URL. Play/Pause
  // (the live state) is what controls firing now, not a separate enable flag.
  const hasUrl = !!input.webhook_url;
  db.prepare(
    'INSERT INTO search_sessions (id, name, webhook_url, webhook_secret, webhook_enabled, fire_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, input.name, input.webhook_url ?? null, input.webhook_secret ?? null,
    hasUrl ? 1 : 0, input.fire_on ?? 'save', created_at
  );
  return {
    id, name: input.name, webhook_url: input.webhook_url, webhook_secret: input.webhook_secret,
    webhook_enabled: hasUrl, fire_on: input.fire_on ?? 'save', created_at,
  };
}

export function updateSearchSession(id: string, patch: {
  name?: string;
  webhook_url?: string;
  webhook_secret?: string;
  webhook_enabled?: boolean;
  fire_on?: SessionFireOn;
}): SearchSession | null {
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name); }
  if (patch.webhook_url !== undefined) {
    sets.push('webhook_url = ?'); vals.push(patch.webhook_url || null);
    // Keep webhook_enabled mirrored to URL presence (derived, not user-controlled).
    sets.push('webhook_enabled = ?'); vals.push(patch.webhook_url ? 1 : 0);
  }
  if (patch.webhook_secret !== undefined) { sets.push('webhook_secret = ?'); vals.push(patch.webhook_secret || null); }
  if (patch.fire_on !== undefined) { sets.push('fire_on = ?'); vals.push(patch.fire_on); }
  if (sets.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE search_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  return getSearchSession(id);
}

// Record that a session just produced/saved an ad (drives "last_activity").
export function touchSearchSession(id: string) {
  const db = getDb();
  db.prepare('UPDATE search_sessions SET last_activity = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function deleteSearchSession(id: string) {
  const db = getDb();
  // Keep the ads — just detach them from the deleted session.
  db.prepare('UPDATE ads SET session_id = NULL WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM search_sessions WHERE id = ?').run(id);
}

// Resolve a session's webhook config (null if the session is gone).
export function getSessionWebhook(id: string): WebhookConfig | null {
  const s = getSearchSession(id);
  if (!s) return null;
  return { url: s.webhook_url, secret: s.webhook_secret, enabled: s.webhook_enabled };
}

// Tags
export function getTags(): Tag[] {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, COUNT(at.ad_id) as ad_count
    FROM tags t
    LEFT JOIN ad_tags at ON at.tag_id = t.id
    GROUP BY t.id
    ORDER BY t.name COLLATE NOCASE ASC
  `).all() as unknown as Tag[];
}

// Create (or return existing by name) — tag names are unique, case-insensitive
export function createTag(name: string, color?: string): Tag {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE').get(name) as Tag | undefined;
  if (existing) return existing;
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, name, color ?? null, created_at);
  return { id, name, color, created_at };
}

export function deleteTag(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM ad_tags WHERE tag_id = ?').run(id);
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
}

export function addTagToAd(adId: string, tagId: string) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO ad_tags (ad_id, tag_id) VALUES (?, ?)').run(adId, tagId);
}

export function removeTagFromAd(adId: string, tagId: string) {
  const db = getDb();
  db.prepare('DELETE FROM ad_tags WHERE ad_id = ? AND tag_id = ?').run(adId, tagId);
}

export function getAdTags(adId: string): Tag[] {
  const db = getDb();
  return db.prepare(`
    SELECT t.* FROM tags t
    JOIN ad_tags at ON at.tag_id = t.id
    WHERE at.ad_id = ?
    ORDER BY t.name COLLATE NOCASE ASC
  `).all(adId) as unknown as Tag[];
}

// Fills ad.tags for a set of ads. Chunked so large result sets (e.g. a 10k
// export) never blow past SQLite's bound-variable limit.
function attachTags(ads: Ad[]): void {
  if (ads.length === 0) return;
  const db = getDb();
  const byAd = new Map<string, Tag[]>();
  const CHUNK = 400;
  for (let i = 0; i < ads.length; i += CHUNK) {
    const slice = ads.slice(i, i + CHUNK);
    const placeholders = slice.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT at.ad_id as ad_id, t.id, t.name, t.color, t.created_at
      FROM ad_tags at JOIN tags t ON t.id = at.tag_id
      WHERE at.ad_id IN (${placeholders})
      ORDER BY t.name COLLATE NOCASE ASC
    `).all(...slice.map((a) => a.id)) as Array<{ ad_id: string } & Tag>;
    for (const r of rows) {
      const list = byAd.get(r.ad_id) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color, created_at: r.created_at });
      byAd.set(r.ad_id, list);
    }
  }
  for (const ad of ads) ad.tags = byAd.get(ad.id) ?? [];
}

// Scrape jobs
export function createScrapeJob(params: SearchParams): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO scrape_jobs (id, params, started_at, status) VALUES (?, ?, ?, ?)').run(
    id, JSON.stringify(params), new Date().toISOString(), 'running'
  );
  return id;
}

export function completeScrapeJob(id: string, total: number) {
  const db = getDb();
  db.prepare('UPDATE scrape_jobs SET status = ?, completed_at = ?, total_found = ? WHERE id = ?').run(
    'complete', new Date().toISOString(), total, id
  );
}

export function errorScrapeJob(id: string) {
  const db = getDb();
  db.prepare(`UPDATE scrape_jobs SET status = 'error', completed_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
}

export function getScrapeJobs(): ScrapeJob[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM scrape_jobs ORDER BY started_at DESC LIMIT 50').all() as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, params: JSON.parse(String(r.params || '{}')) })) as ScrapeJob[];
}

// Bulk jobs
export function createBulkJob(
  name: string,
  companies: Array<{ company_name: string; website?: string; category?: string; page_id?: string }>,
  filters?: AdScopeFilters,
  webhook?: WebhookConfig
): BulkJob {
  const db = getDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.prepare(
    'INSERT INTO bulk_jobs (id, name, created_at, status, total_companies, filters, webhook_url, webhook_secret, webhook_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, name, created_at, 'queued', companies.length, JSON.stringify(filters ?? {}),
    webhook?.url ?? null, webhook?.secret ?? null, webhook?.enabled ? 1 : 0
  );
  const insertCompany = db.prepare(
    'INSERT INTO bulk_job_companies (id, job_id, company_name, website, category, matched_page_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const c of companies) {
    // A user-supplied page URL/ID is stored up front so the scraper skips the
    // fuzzy typeahead match entirely and scrapes the exact page.
    insertCompany.run(crypto.randomUUID(), id, c.company_name, c.website ?? null, c.category ?? null, c.page_id ?? null, 'pending');
  }
  return {
    id, name, created_at, status: 'queued', total_companies: companies.length, completed_companies: 0,
    filters: filters ?? {}, webhook_url: webhook?.url, webhook_secret: webhook?.secret, webhook_enabled: !!webhook?.enabled,
  };
}

function rowToBulkJob(row: Record<string, unknown> | undefined): BulkJob | null {
  if (!row) return null;
  let filters: AdScopeFilters = {};
  try { filters = JSON.parse(String(row.filters || '{}')); } catch { /* default */ }
  return { ...(row as unknown as BulkJob), filters, webhook_enabled: row.webhook_enabled === 1 };
}

export function getBulkJob(id: string): BulkJob | null {
  const db = getDb();
  return rowToBulkJob(db.prepare('SELECT * FROM bulk_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined);
}

export function getBulkJobStatus(id: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT status FROM bulk_jobs WHERE id = ?').get(id) as { status: string } | undefined;
  return row?.status ?? null;
}

// When a stream restarts (resume / fresh open), any company left mid-flight as
// 'scraping' is not actually being worked on — reset it so it gets re-queued.
export function resetStuckBulkCompanies(jobId: string) {
  const db = getDb();
  db.prepare(`UPDATE bulk_job_companies SET status = 'pending' WHERE job_id = ? AND status = 'scraping'`).run(jobId);
}

// All ads scraped under a bulk job (ads are stored per-company via scrape_job_id)
export function getAdsByBulkJob(jobId: string): Ad[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.* FROM ads a
    JOIN bulk_job_companies c ON a.scrape_job_id = c.id
    WHERE c.job_id = ?
    ORDER BY a.advertiser_name, a.scraped_at DESC
  `).all(jobId) as Record<string, unknown>[];
  return rows.map(rowToAd);
}

export function getBulkJobCompanies(jobId: string): BulkCompany[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM bulk_job_companies WHERE job_id = ? ORDER BY rowid').all(jobId) as Record<string, unknown>[];
  return rows.map((r) => ({
    ...r,
    ad_types: JSON.parse(String(r.ad_types || '[]')),
    platforms: JSON.parse(String(r.platforms || '[]')),
  })) as BulkCompany[];
}

export function updateBulkCompany(id: string, data: Partial<BulkCompany>) {
  const db = getDb();
  db.prepare(`
    UPDATE bulk_job_companies SET
      status = COALESCE(@status, status),
      active_ads_count = COALESCE(@active_ads_count, active_ads_count),
      inactive_ads_count = COALESCE(@inactive_ads_count, inactive_ads_count),
      ad_types = COALESCE(@ad_types, ad_types),
      platforms = COALESCE(@platforms, platforms),
      spend_range = COALESCE(@spend_range, spend_range),
      last_ad_date = COALESCE(@last_ad_date, last_ad_date),
      matched_name = COALESCE(@matched_name, matched_name),
      matched_page_id = COALESCE(@matched_page_id, matched_page_id),
      fb_handle = COALESCE(@fb_handle, fb_handle),
      ig_handle = COALESCE(@ig_handle, ig_handle),
      match_method = COALESCE(@match_method, match_method),
      scraped_at = COALESCE(@scraped_at, scraped_at)
    WHERE id = @id
  `).run({
    id,
    status: data.status ?? null,
    active_ads_count: data.active_ads_count ?? null,
    inactive_ads_count: data.inactive_ads_count ?? null,
    ad_types: data.ad_types ? JSON.stringify(data.ad_types) : null,
    platforms: data.platforms ? JSON.stringify(data.platforms) : null,
    spend_range: data.spend_range ?? null,
    last_ad_date: data.last_ad_date ?? null,
    matched_name: data.matched_name ?? null,
    matched_page_id: data.matched_page_id ?? null,
    fb_handle: data.fb_handle ?? null,
    ig_handle: data.ig_handle ?? null,
    match_method: data.match_method ?? null,
    scraped_at: data.scraped_at ?? null,
  });
}

export function incrementBulkJobProgress(jobId: string) {
  const db = getDb();
  db.prepare('UPDATE bulk_jobs SET completed_companies = completed_companies + 1 WHERE id = ?').run(jobId);
}

export function completeBulkJob(jobId: string) {
  const db = getDb();
  db.prepare(`UPDATE bulk_jobs SET status = 'complete' WHERE id = ?`).run(jobId);
}

export function updateBulkJobStatus(jobId: string, status: string) {
  const db = getDb();
  db.prepare('UPDATE bulk_jobs SET status = ? WHERE id = ?').run(status, jobId);
}

export function getBulkJobs(archived = false): BulkJob[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM bulk_jobs WHERE COALESCE(archived, 0) = ? ORDER BY created_at DESC LIMIT 50')
    .all(archived ? 1 : 0) as BulkJob[];
}

export function setBulkJobArchived(id: string, archived: boolean) {
  const db = getDb();
  db.prepare('UPDATE bulk_jobs SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
}

export function deleteBulkJob(id: string) {
  const db = getDb();
  // Remove the job and its company rows. Scraped ads are keyed by the per-company
  // scrape_job_id and are left intact (they may be saved or in collections).
  const tx = db.transaction((jobId: string) => {
    db.prepare('DELETE FROM bulk_job_companies WHERE job_id = ?').run(jobId);
    db.prepare('DELETE FROM bulk_jobs WHERE id = ?').run(jobId);
  });
  tx(id);
}
