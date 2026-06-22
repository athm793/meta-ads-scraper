export type MediaType = 'image' | 'video' | 'carousel' | 'meme' | 'multi_video' | 'unknown';
export type AdStatus = 'ACTIVE' | 'INACTIVE';
export type AdCategory = 'ALL' | 'POLITICAL' | 'HOUSING' | 'EMPLOYMENT' | 'CREDIT';
export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'AUDIENCE_NETWORK' | 'MESSENGER';
export type ScrapeJobStatus = 'running' | 'complete' | 'error';
export type BulkJobStatus = 'queued' | 'running' | 'complete' | 'error';
export type BulkCompanyStatus = 'pending' | 'scraping' | 'done' | 'not_found' | 'error';

export interface CarouselCard {
  title?: string;
  body?: string;
  link_url?: string;
  image_url?: string;
  video_url?: string;
  cta_text?: string;
}

export interface DemographicEntry {
  age?: string;
  gender?: string;
  percentage: number;
}

export interface RegionEntry {
  region: string;
  percentage: number;
}

export interface Ad {
  id: string;
  advertiser_name: string;
  advertiser_page_id?: string;
  body_variants: string[];
  headline?: string;
  cta_text?: string;
  link_url?: string;
  media_type: MediaType;
  media_urls: string[];
  carousel_cards: CarouselCard[];
  platforms: Platform[];
  status: AdStatus;
  category: AdCategory;
  started_at?: string;
  stopped_at?: string;
  days_running?: number;
  country?: string;
  language?: string;
  spend_min?: number;
  spend_max?: number;
  spend_currency?: string;
  impressions_min?: number;
  impressions_max?: number;
  funding_entity?: string;
  demographic_distribution: DemographicEntry[];
  region_distribution: RegionEntry[];
  ad_snapshot_url?: string;
  saved: boolean;
  collection_id?: string;
  scraped_at: string;
  scrape_job_id?: string;
  is_new?: boolean;
}

export interface SearchParams {
  keyword?: string;
  advertiser?: string;
  country?: string;
  category?: AdCategory;
  platform?: Platform;
  ad_type?: MediaType;
  status?: AdStatus | 'ALL';
  date_from?: string;
  date_to?: string;
  language?: string;
  limit?: number;
}

export interface ScrapeJob {
  id: string;
  params: SearchParams;
  started_at: string;
  completed_at?: string;
  total_found: number;
  status: ScrapeJobStatus;
}

export interface Collection {
  id: string;
  name: string;
  created_at: string;
  color?: string;
  ad_count?: number;
}

export interface BulkJob {
  id: string;
  name: string;
  created_at: string;
  status: BulkJobStatus;
  total_companies: number;
  completed_companies: number;
}

export interface BulkCompany {
  id: string;
  job_id: string;
  company_name: string;
  website?: string;
  status: BulkCompanyStatus;
  active_ads_count: number;
  inactive_ads_count: number;
  ad_types: MediaType[];
  platforms: Platform[];
  spend_range?: string;
  last_ad_date?: string;
  scraped_at?: string;
}

export interface SSEEvent {
  type: 'ad' | 'done' | 'error' | 'progress';
  data?: Ad;
  total?: number;
  message?: string;
  count?: number;
}

export interface BulkSSEEvent {
  type: 'company_start' | 'company_done' | 'done' | 'error';
  company_name?: string;
  company_id?: string;
  result?: BulkCompany;
  message?: string;
  total?: number;
}
