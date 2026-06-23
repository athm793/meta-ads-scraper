export type MediaType = 'image' | 'video' | 'carousel' | 'meme' | 'multi_video' | 'unknown';
export type AdStatus = 'ACTIVE' | 'INACTIVE';
export type AdCategory = 'ALL' | 'POLITICAL' | 'HOUSING' | 'EMPLOYMENT' | 'CREDIT';
export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'AUDIENCE_NETWORK' | 'MESSENGER';
export type ScrapeJobStatus = 'running' | 'complete' | 'error';
export type BulkJobStatus = 'queued' | 'running' | 'complete' | 'error' | 'paused' | 'cancelled';
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
  media_urls: string[];       // thumbnail / image URLs
  video_urls: string[];       // actual playable video URLs
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
  tags?: Tag[];
  scraped_at: string;
  scrape_job_id?: string;
  is_new?: boolean;
  // Deep Search fields — populated when scrapeAdvertiserDeep is used
  deep_search_done?: boolean;
  targeting_age_min?: number;
  targeting_age_max?: number;
  targeting_gender?: string;
  targeting_locations?: string[];
  targeting_interests?: string[];
  policy_status?: string;
  // "See ad details" / EU transparency data — populated when detail fetch runs
  detail_fetched?: boolean;
  total_reach?: number;            // EU total reach (when available)
  beneficiary?: string;            // ad beneficiary (EU transparency)
  payer?: string;                  // ad payer (EU transparency)
}

// Filters controlling which scraped ads to keep / detail. Applied client+server.
export interface AdScopeFilters {
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  media_types?: MediaType[];       // empty/undefined = all
  platforms?: Platform[];          // empty/undefined = all
  fetch_details?: boolean;         // run the "See ad details" fetch per ad
  workers?: number;                // parallel companies scraped at once (1–20)
  match_pages?: boolean;           // resolve each company to its brand page (typeahead) and scrape that page
  country?: string;                // country used to look up brand pages (typeahead)
}

export interface SearchParams {
  keyword?: string;
  advertiser?: string;
  page_id?: string;
  country?: string;
  category?: AdCategory;
  platform?: Platform;
  ad_type?: MediaType;
  status?: AdStatus | 'ALL';
  date_from?: string;
  date_to?: string;
  language?: string;
  limit?: number;
  deep_search?: boolean;
  fetch_details?: boolean;   // fetch "See ad details" data for every ad
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

export interface Tag {
  id: string;
  name: string;
  color?: string;
  created_at: string;
  ad_count?: number;
}

// An advertiser page returned by Meta's search typeahead
export interface AdvertiserSuggestion {
  page_id: string;
  name: string;
  category?: string;
  image_uri?: string;
  likes?: number;
  ig_followers?: number;
  verified?: boolean;
  page_alias?: string;
}

export interface BulkJob {
  id: string;
  name: string;
  created_at: string;
  status: BulkJobStatus;
  total_companies: number;
  completed_companies: number;
  filters?: AdScopeFilters;
}

export interface BulkCompany {
  id: string;
  job_id: string;
  company_name: string;
  website?: string;
  category?: string;       // expected brand category from the upload (helps disambiguate matches)
  matched_name?: string;   // the advertiser page actually matched + scraped
  matched_page_id?: string; // resolved Meta page id (from a user-supplied URL/ID or typeahead match)
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
  type: 'company_start' | 'company_done' | 'done' | 'error' | 'paused' | 'cancelled';
  company_name?: string;
  company_id?: string;
  result?: BulkCompany;
  message?: string;
  total?: number;
  dedup_count?: number;
}
