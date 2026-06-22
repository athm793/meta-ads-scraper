import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  Ad,
  Collection,
  ScrapeJob,
  BulkJob,
  BulkCompany,
  SearchParams,
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
      scraped_at TEXT,
      scrape_job_id TEXT
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT,
      color TEXT
    );

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
}

export function upsertAd(ad: Ad) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO ads (
      id, advertiser_name, advertiser_page_id, body_variants, headline,
      cta_text, link_url, media_type, media_urls, carousel_cards, platforms,
      status, category, started_at, stopped_at, days_running, country, language,
      spend_min, spend_max, spend_currency, impressions_min, impressions_max,
      funding_entity, demographic_distribution, region_distribution,
      ad_snapshot_url, saved, collection_id, scraped_at, scrape_job_id
    ) VALUES (
      @id, @advertiser_name, @advertiser_page_id, @body_variants, @headline,
      @cta_text, @link_url, @media_type, @media_urls, @carousel_cards, @platforms,
      @status, @category, @started_at, @stopped_at, @days_running, @country, @language,
      @spend_min, @spend_max, @spend_currency, @impressions_min, @impressions_max,
      @funding_entity, @demographic_distribution, @region_distribution,
      @ad_snapshot_url, @saved, @collection_id, @scraped_at, @scrape_job_id
    )
  `).run({
    ...ad,
    body_variants: JSON.stringify(ad.body_variants),
    media_urls: JSON.stringify(ad.media_urls),
    carousel_cards: JSON.stringify(ad.carousel_cards),
    platforms: JSON.stringify(ad.platforms),
    demographic_distribution: JSON.stringify(ad.demographic_distribution),
    region_distribution: JSON.stringify(ad.region_distribution),
    saved: ad.saved ? 1 : 0,
    advertiser_page_id: ad.advertiser_page_id ?? null,
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
  });
}

function rowToAd(row: Record<string, unknown>): Ad {
  return {
    ...(row as Omit<Ad, 'body_variants' | 'media_urls' | 'carousel_cards' | 'platforms' | 'demographic_distribution' | 'region_distribution' | 'saved'>),
    body_variants: JSON.parse(String(row.body_variants || '[]')),
    media_urls: JSON.parse(String(row.media_urls || '[]')),
    carousel_cards: JSON.parse(String(row.carousel_cards || '[]')),
    platforms: JSON.parse(String(row.platforms || '[]')),
    demographic_distribution: JSON.parse(String(row.demographic_distribution || '[]')),
    region_distribution: JSON.parse(String(row.region_distribution || '[]')),
    saved: row.saved === 1,
  };
}

export function queryAds(params: {
  search?: string;
  advertiser?: string;
  status?: string;
  saved?: boolean;
  collection_id?: string;
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

  return { ads: rows.map(rowToAd), total };
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
export function createBulkJob(name: string, companies: Array<{ company_name: string; website?: string }>): BulkJob {
  const db = getDb();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.prepare('INSERT INTO bulk_jobs (id, name, created_at, status, total_companies) VALUES (?, ?, ?, ?, ?)').run(
    id, name, created_at, 'queued', companies.length
  );
  const insertCompany = db.prepare(
    'INSERT INTO bulk_job_companies (id, job_id, company_name, website, status) VALUES (?, ?, ?, ?, ?)'
  );
  for (const c of companies) {
    insertCompany.run(crypto.randomUUID(), id, c.company_name, c.website ?? null, 'pending');
  }
  return { id, name, created_at, status: 'queued', total_companies: companies.length, completed_companies: 0 };
}

export function getBulkJob(id: string): BulkJob | null {
  const db = getDb();
  return db.prepare('SELECT * FROM bulk_jobs WHERE id = ?').get(id) as BulkJob | null;
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
