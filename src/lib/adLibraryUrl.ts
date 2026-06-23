// Builds public Meta Ad Library URLs — the same destinations the scraper visits,
// so users can open exactly what was scraped for each company.

const BASE = 'https://www.facebook.com/ads/library/';

/** Full-library page view for a resolved advertiser page id. */
export function pageUrl(pageId: string, country = 'ALL'): string {
  const u = new URL(BASE);
  u.searchParams.set('active_status', 'all');
  u.searchParams.set('ad_type', 'all');
  u.searchParams.set('country', country || 'ALL');
  u.searchParams.set('view_all_page_id', pageId);
  u.searchParams.set('search_type', 'page');
  u.searchParams.set('media_type', 'all');
  return u.toString();
}

/** Keyword search results page (used when no brand page was matched). */
export function keywordUrl(query: string, country = 'ALL'): string {
  const u = new URL(BASE);
  u.searchParams.set('active_status', 'all');
  u.searchParams.set('ad_type', 'all');
  u.searchParams.set('country', country || 'ALL');
  u.searchParams.set('q', query);
  u.searchParams.set('search_type', 'keyword_unordered');
  u.searchParams.set('media_type', 'all');
  return u.toString();
}

/** The page/keyword URL that was actually scraped for a bulk company. */
export function companyResultsUrl(opts: { matched_page_id?: string; company_name: string; country?: string }): string {
  if (opts.matched_page_id) return pageUrl(opts.matched_page_id, opts.country);
  return keywordUrl(opts.company_name, opts.country);
}

/**
 * Extracts a Meta page id from a pasted Ad Library URL, page URL, or a raw
 * numeric id. Returns null if nothing id-like is found.
 *   https://www.facebook.com/ads/library/?...view_all_page_id=123  -> "123"
 *   https://www.facebook.com/PageName-123456789                    -> "123456789"
 *   123456789                                                       -> "123456789"
 */
export function extractPageId(input: string): string | null {
  const s = (input || '').trim();
  if (!s) return null;
  // Already a bare numeric id (Meta page ids are long numbers)
  if (/^\d{6,}$/.test(s)) return s;
  // view_all_page_id / page_id query param
  const param = s.match(/(?:view_all_page_id|page_id)=(\d{6,})/i);
  if (param) return param[1];
  // Trailing -<digits> in a vanity URL
  const trailing = s.match(/-(\d{8,})\/?$/);
  if (trailing) return trailing[1];
  // Any long digit run as a last resort
  const any = s.match(/(\d{9,})/);
  return any ? any[1] : null;
}
