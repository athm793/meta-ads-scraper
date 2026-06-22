'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdGrid } from '@/components/ads/AdGrid';
import { AdModal } from '@/components/ads/AdModal';
import { FiltersPanel } from '@/components/ads/FiltersPanel';
import { CollectionsPanel } from '@/components/ads/CollectionsPanel';
import { HookExtractor } from '@/components/ads/HookExtractor';
import { BulkUpload } from '@/components/ads/BulkUpload';
import { BulkResultsTable } from '@/components/ads/BulkResultsTable';
import { CompanyDrawer } from '@/components/ads/CompanyDrawer';
import { ResultsFilterBar, EMPTY_RESULT_FILTERS, type ResultFilters } from '@/components/ads/ResultsFilterBar';
import { Pagination } from '@/components/ads/Pagination';
import { adsToCsv, exportFilename } from '@/lib/exportCsv';
import type { Ad, SearchParams, Collection, Tag, BulkCompany, BulkJob } from '@/types/ads';
import {
  Search, BookMarked, Users, Zap, FolderPlus, Download, SlidersHorizontal,
  Square, Layers,
} from 'lucide-react';

const DEFAULT_PARAMS: SearchParams = {
  country: 'US',
  status: 'ALL',
  limit: 100,
};

const tabVariants = {
  initial: { opacity: 0, x: 16, filter: 'blur(4px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -16, filter: 'blur(4px)' },
};

const spring = { type: 'spring' as const, stiffness: 380, damping: 28 };

export default function HomePage() {
  // Search state
  const [keyword, setKeyword] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [filterParams, setFilterParams] = useState<SearchParams>(DEFAULT_PARAMS);
  const [sortBy, setSortBy] = useState('scraped_at');
  const [deepSearch, setDeepSearch] = useState(false);
  const [resultFilters, setResultFilters] = useState<ResultFilters>(EMPTY_RESULT_FILTERS);
  const [searchPage, setSearchPage] = useState(1);

  // Scrape state
  const [scraping, setScraping] = useState(false);
  const [scrapeCount, setScrapeCount] = useState(0);
  const [liveAds, setLiveAds] = useState<Ad[]>([]);
  const [, setActiveJobId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const scrapeAbort = useRef<AbortController | null>(null);

  // UI state
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState('search');
  const [showFilters, setShowFilters] = useState(true);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [hooksOpen, setHooksOpen] = useState(false);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [savedSearch, setSavedSearch] = useState('');

  // Bulk state
  const queryClient = useQueryClient();
  const [bulkJobId, setBulkJobId] = useState<string | null>(null);
  const [selectedBulkCompany, setSelectedBulkCompany] = useState<BulkCompany | null>(null);
  const [companyDrawerOpen, setCompanyDrawerOpen] = useState(false);
  const [dedupCount, setDedupCount] = useState(0);
  const bulkAbort = useRef<AbortController | null>(null);
  const streamingRef = useRef<string | null>(null);

  // The open job's data is polled from the server so status/progress stay live
  // without a manual refresh. Polling stops once the job reaches a terminal state.
  const { data: openJobData } = useQuery<{ job: BulkJob | null; companies: BulkCompany[] }>({
    queryKey: ['bulk-job', bulkJobId],
    queryFn: () => fetch(`/api/bulk/${bulkJobId}/results`).then((r) => r.json()),
    enabled: !!bulkJobId,
    refetchInterval: (query) => {
      const s = query.state.data?.job?.status;
      return s === 'running' || s === 'queued' ? 2000 : false;
    },
  });
  const bulkJob = openJobData?.job ?? null;
  const bulkCompanies = openJobData?.companies ?? [];

  const { data: collections = [], refetch: refetchCollections } = useQuery<Collection[]>({
    queryKey: ['collections'],
    queryFn: () => fetch('/api/collections').then((r) => r.json()),
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => fetch('/api/tags').then((r) => r.json()),
  });

  const { data: savedData, refetch: refetchSaved } = useQuery({
    queryKey: ['saved-ads', activeCollection, activeTag, savedSearch, sortBy],
    queryFn: () => {
      const params = new URLSearchParams({ saved: 'true', limit: '200', sort: sortBy });
      if (activeCollection) params.set('collection_id', activeCollection);
      if (activeTag) params.set('tag_id', activeTag);
      if (savedSearch.trim()) params.set('search', savedSearch.trim());
      return fetch(`/api/ads?${params}`).then((r) => r.json());
    },
    enabled: tab === 'saved',
  });

  async function startScrape() {
    if (scraping) return;
    const params: SearchParams = {
      ...filterParams,
      keyword: keyword || undefined,
      advertiser: advertiser || undefined,
      deep_search: deepSearch,
      fetch_details: deepSearch,
    };
    if (!params.keyword && !params.advertiser) {
      alert('Enter a keyword or advertiser name to search');
      return;
    }

    setLiveAds([]);
    setScrapeCount(0);
    setScraping(true);
    setHasSearched(true);
    setActiveJobId(null);
    setSearchPage(1);

    const abort = new AbortController();
    scrapeAbort.current = abort;

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abort.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'job_id') setActiveJobId(event.job_id);
            if (event.type === 'ad') {
              setLiveAds((prev) => [...prev, event.data]);
              setScrapeCount((c) => c + 1);
            }
            if (event.type === 'done') setScraping(false);
            if (event.type === 'error') {
              console.error('Scrape error:', event.message);
              setScraping(false);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e);
    } finally {
      setScraping(false);
    }
  }

  function stopScrape() {
    scrapeAbort.current?.abort();
    setScraping(false);
  }

  async function handleSave(id: string, saved: boolean) {
    await fetch(`/api/ads/${id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved }),
    });
    setLiveAds((prev) => prev.map((a) => (a.id === id ? { ...a, saved } : a)));
    if (tab === 'saved') refetchSaved();
  }

  async function createCollection(name: string, color: string) {
    await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    refetchCollections();
  }

  async function deleteCollection(id: string) {
    await fetch('/api/collections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activeCollection === id) setActiveCollection(null);
    refetchCollections();
  }

  async function createTag(name: string, color: string) {
    await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    queryClient.invalidateQueries({ queryKey: ['tags'] });
  }

  async function deleteTag(id: string) {
    await fetch('/api/tags', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activeTag === id) setActiveTag(null);
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['saved-ads'] });
  }

  function refreshBulk(jobId: string) {
    queryClient.invalidateQueries({ queryKey: ['bulk-job', jobId] });
    queryClient.invalidateQueries({ queryKey: ['bulk-jobs'] });
  }

  // Holds the SSE connection open so the server keeps scraping. Display is
  // driven by the polling query above; here we only track dedup count and
  // nudge the queries on meaningful events. Aborting bulkAbort closes it.
  async function streamBulk(jobId: string) {
    bulkAbort.current?.abort();
    const abort = new AbortController();
    bulkAbort.current = abort;
    streamingRef.current = jobId;

    let sse: Response;
    try {
      sse = await fetch(`/api/bulk/${jobId}/stream`, { signal: abort.signal });
    } catch {
      if (streamingRef.current === jobId) streamingRef.current = null;
      return;
    }
    const reader = sse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.dedup_count !== undefined) setDedupCount(event.dedup_count);
            if (event.type === 'done' || event.type === 'paused' || event.type === 'cancelled') {
              refreshBulk(jobId);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* stream ended / aborted */ }
    finally {
      if (streamingRef.current === jobId) streamingRef.current = null;
    }
  }

  function startBulkScrape(jobId: string) {
    bulkAbort.current?.abort();
    streamingRef.current = null;
    setDedupCount(0);
    setBulkJobId(jobId);
    // The polling query loads the job; an effect opens the stream if it's active.
  }

  async function controlBulk(action: 'pause' | 'resume' | 'stop') {
    if (!bulkJobId) return;

    // Set the status server-side first so the running worker sees it before we
    // close the stream — otherwise the abort races the DB write.
    await fetch(`/api/bulk/${bulkJobId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    if (action === 'pause' || action === 'stop') {
      bulkAbort.current?.abort();
      streamingRef.current = null;
    }
    // Resume just flips status back to queued; the streaming effect picks it up.
    refreshBulk(bulkJobId);
  }

  function downloadAds(ads: Ad[], base: string, label: string, format: 'csv' | 'json') {
    if (ads.length === 0) return;
    const data = format === 'csv' ? adsToCsv(ads) : JSON.stringify(ads, null, 2);
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
    const name = exportFilename(base, label).replace(/\.csv$/, format === 'json' ? '.json' : '.csv');
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Exports exactly what's shown on the search page (after result filters)
  function downloadSearch(format: 'csv' | 'json') {
    downloadAds(filteredAds, 'meta-ads', 'search', format);
  }
  function downloadSaved(format: 'csv' | 'json') {
    downloadAds(savedData?.ads || [], 'meta-ads', 'saved', format);
  }

  async function deleteBulkJobAndExit() {
    if (!bulkJobId) return;
    if (!window.confirm('Delete this job permanently? This removes the run and its company results (scraped ad data is kept).')) return;
    bulkAbort.current?.abort();
    streamingRef.current = null;
    await fetch(`/api/bulk/${bulkJobId}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['bulk-jobs'] });
    setBulkJobId(null);
    setDedupCount(0);
  }

  // Keep an SSE stream open whenever the open job is active so it keeps making
  // progress (survives tab switches and page refreshes via the persisted id).
  useEffect(() => {
    if (!bulkJobId || !bulkJob) return;
    const active = bulkJob.status === 'running' || bulkJob.status === 'queued';
    if (active && streamingRef.current !== bulkJobId) {
      streamBulk(bulkJobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkJobId, bulkJob?.status]);

  // Restore the last-open tab and bulk job across page refreshes. This must run
  // post-mount (not via a lazy useState initializer) to avoid an SSR hydration
  // mismatch, so setState-in-effect is intentional here.
  useEffect(() => {
    try {
      const t = localStorage.getItem('mas_tab');
      const jid = localStorage.getItem('mas_bulkJobId');
      /* eslint-disable react-hooks/set-state-in-effect */
      if (t === 'search' || t === 'saved' || t === 'bulk') setTab(t);
      if (jid) setBulkJobId(jid);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('mas_tab', tab); } catch { /* ignore */ }
  }, [tab]);

  useEffect(() => {
    try {
      if (bulkJobId) localStorage.setItem('mas_bulkJobId', bulkJobId);
      else localStorage.removeItem('mas_bulkJobId');
    } catch { /* ignore */ }
  }, [bulkJobId]);

  const sortedAds = [...liveAds].sort((a, b) => {
    if (sortBy === 'days_running') return (b.days_running ?? 0) - (a.days_running ?? 0);
    if (sortBy === 'started_at') return (b.started_at ?? '').localeCompare(a.started_at ?? '');
    return (b.scraped_at ?? '').localeCompare(a.scraped_at ?? '');
  });

  // Client-side filtering of the already-scraped results shown on the search page
  const filteredAds = sortedAds.filter((ad) => {
    if (resultFilters.status !== 'ALL' && ad.status !== resultFilters.status) return false;
    if (resultFilters.media.length > 0 && !resultFilters.media.includes(ad.media_type)) return false;
    if (resultFilters.platforms.length > 0 && !ad.platforms.some((p) => resultFilters.platforms.includes(p))) return false;
    if (resultFilters.q.trim()) {
      const q = resultFilters.q.toLowerCase();
      const hay = [ad.advertiser_name, ad.headline ?? '', ...(ad.body_variants ?? [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const newCount = filteredAds.filter((a) => a.is_new).length;
  const displayAds = tab === 'saved' ? (savedData?.ads || []) : filteredAds;

  const SEARCH_PER_PAGE = 24;
  const searchTotalPages = Math.max(1, Math.ceil(filteredAds.length / SEARCH_PER_PAGE));
  const safeSearchPage = Math.min(searchPage, searchTotalPages);
  const pagedSearchAds = filteredAds.slice((safeSearchPage - 1) * SEARCH_PER_PAGE, safeSearchPage * SEARCH_PER_PAGE);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Filters sidebar */}
      <AnimatePresence initial={false}>
        {showFilters && tab === 'search' && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={spring}
            className="border-r border-border/50 shrink-0 overflow-hidden flex flex-col bg-card/30"
          >
            <div className="w-72">
              <FiltersPanel
                params={filterParams}
                onChange={(p) => setFilterParams((prev) => ({ ...prev, ...p }))}
                onReset={() => setFilterParams(DEFAULT_PARAMS)}
                collections={collections}
                activeCollection={activeCollection}
                onCollectionChange={setActiveCollection}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top nav */}
        <header className="border-b border-border/50 px-4 py-3 flex items-center gap-3 shrink-0 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-bold text-sm tracking-tight">Meta Ads</span>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-8">
              <TabsTrigger value="search" className="text-xs">
                <Search className="w-3.5 h-3.5 mr-1" />Search
              </TabsTrigger>
              <TabsTrigger value="saved" className="text-xs">
                <BookMarked className="w-3.5 h-3.5 mr-1" />Saved
              </TabsTrigger>
              <TabsTrigger value="bulk" className="text-xs">
                <Users className="w-3.5 h-3.5 mr-1" />Bulk
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 ml-auto">
            {tab === 'search' && (
              <>
                <Button size="sm" variant="outline" onClick={() => setHooksOpen(true)} className="h-8 text-xs">
                  <Zap className="w-3 h-3 mr-1" />Hooks
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCollectionsOpen(true)} className="h-8 text-xs">
                  <FolderPlus className="w-3 h-3 mr-1" />Collections
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowFilters((v) => !v)} className="h-8 text-xs">
                  <SlidersHorizontal className="w-3 h-3 mr-1" />{showFilters ? 'Hide' : 'Filters'}
                </Button>
                {filteredAds.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => downloadSearch('csv')} className="h-8 text-xs">
                      <Download className="w-3 h-3 mr-1" />CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadSearch('json')} className="h-8 text-xs">
                      <Download className="w-3 h-3 mr-1" />JSON
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            {/* Search Tab */}
            {tab === 'search' && (
              <motion.div
                key="search"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="p-4 space-y-4"
              >
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Keyword in ad copy..."
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && startScrape()}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex-1 relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Advertiser / page name..."
                      value={advertiser}
                      onChange={(e) => setAdvertiser(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && startScrape()}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={deepSearch ? 'default' : 'outline'}
                    onClick={() => setDeepSearch((v) => !v)}
                    className="h-10 px-3 shrink-0"
                    title="Deep Search: scrapes full advertiser page sorted by impressions"
                  >
                    <Layers className="w-3.5 h-3.5 mr-1.5" />
                    Deep
                  </Button>
                  <Button onClick={startScrape} disabled={scraping} className="px-6 h-10 shrink-0">
                    {scraping ? 'Scraping...' : 'Scrape'}
                  </Button>
                </div>

                {/* Inline scrape status */}
                <AnimatePresence>
                  {scraping && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-3 text-sm overflow-hidden"
                    >
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                      <span className="text-muted-foreground">
                        {deepSearch ? 'Deep scraping' : 'Scraping'} — {liveAds.length} ads found
                      </span>
                      <button
                        onClick={stopScrape}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                      >
                        <Square className="w-3 h-3" /> Stop
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {liveAds.length > 0 && (
                  <ResultsFilterBar
                    filters={resultFilters}
                    onChange={(f) => { setResultFilters((prev) => ({ ...prev, ...f })); setSearchPage(1); }}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    shownCount={filteredAds.length}
                    totalCount={liveAds.length}
                    newCount={newCount}
                  />
                )}

                <AdGrid
                  ads={pagedSearchAds}
                  loading={scraping && liveAds.length === 0}
                  hasSearched={hasSearched}
                  onAdClick={(ad) => { setSelectedAd(ad); setModalOpen(true); }}
                  onSave={handleSave}
                />

                <Pagination
                  page={safeSearchPage}
                  totalPages={searchTotalPages}
                  total={filteredAds.length}
                  perPage={SEARCH_PER_PAGE}
                  onPage={setSearchPage}
                />
              </motion.div>
            )}

            {/* Saved Tab */}
            {tab === 'saved' && (
              <motion.div
                key="saved"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <h2 className="font-semibold">Saved Ads</h2>
                    {savedData?.total > 0 && <Badge variant="secondary">{savedData.total}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-56 max-w-[40vw]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search saved ads..."
                        value={savedSearch}
                        onChange={(e) => setSavedSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    {(savedData?.ads?.length ?? 0) > 0 && (
                      <Button size="sm" variant="outline" onClick={() => downloadSaved('csv')} className="h-8 text-xs">
                        <Download className="w-3 h-3 mr-1" />Export
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setCollectionsOpen(true)} className="h-8 text-xs">
                      <FolderPlus className="w-3 h-3 mr-1" />Manage
                    </Button>
                  </div>
                </div>

                {collections.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide mr-1">Lists</span>
                    <button
                      onClick={() => setActiveCollection(null)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${!activeCollection ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border'}`}
                    >
                      All
                    </button>
                    {collections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setActiveCollection(activeCollection === c.id ? null : c.id)}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors flex items-center gap-1.5 ${activeCollection === c.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border'}`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: c.color || '#6366f1' }} />
                        {c.name} {c.ad_count != null ? `(${c.ad_count})` : ''}
                      </button>
                    ))}
                  </div>
                )}

                {tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide mr-1">Tags</span>
                    {activeTag && (
                      <button onClick={() => setActiveTag(null)} className="px-2.5 py-1 rounded-full text-xs border border-border hover:bg-muted transition-colors text-muted-foreground">
                        Clear
                      </button>
                    )}
                    {tags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setActiveTag(activeTag === t.id ? null : t.id)}
                        className="px-2.5 py-1 rounded-full text-xs border transition-colors flex items-center gap-1.5"
                        style={activeTag === t.id
                          ? { background: t.color || '#6366f1', borderColor: t.color || '#6366f1', color: '#fff' }
                          : { borderColor: (t.color || '#6366f1') + '55', color: t.color || '#a5b4fc' }}
                      >
                        {t.name} {t.ad_count != null ? `(${t.ad_count})` : ''}
                      </button>
                    ))}
                  </div>
                )}

                <AdGrid
                  ads={savedData?.ads || []}
                  loading={false}
                  hasSearched={true}
                  onAdClick={(ad) => { setSelectedAd(ad); setModalOpen(true); }}
                  onSave={handleSave}
                />
              </motion.div>
            )}

            {/* Bulk Tab */}
            {tab === 'bulk' && (
              <motion.div
                key="bulk"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="p-6"
              >
                <AnimatePresence mode="wait">
                  {!bulkJobId ? (
                    <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <BulkUpload onStart={startBulkScrape} />
                    </motion.div>
                  ) : (
                    <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { bulkAbort.current?.abort(); streamingRef.current = null; setBulkJobId(null); setDedupCount(0); }}
                        className="h-8 text-xs"
                      >
                        ← All Jobs
                      </Button>
                      {bulkJob && (
                        <BulkResultsTable
                          job={bulkJob}
                          companies={bulkCompanies}
                          onCompanyClick={(c) => { setSelectedBulkCompany(c); setCompanyDrawerOpen(true); }}
                          onExport={() => window.open(`/api/bulk/${bulkJobId}/export`, '_blank')}
                          onExportAds={() => window.open(`/api/bulk/${bulkJobId}/export?type=ads`, '_blank')}
                          onPause={() => controlBulk('pause')}
                          onResume={() => controlBulk('resume')}
                          onStop={() => controlBulk('stop')}
                          onDelete={() => deleteBulkJobAndExit()}
                          dedupCount={dedupCount}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Overlays */}
      <AdModal ad={selectedAd} open={modalOpen} onClose={() => setModalOpen(false)} />

      <CollectionsPanel
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
        collections={collections}
        tags={tags}
        onCreate={createCollection}
        onDelete={deleteCollection}
        onCreateTag={createTag}
        onDeleteTag={deleteTag}
      />

      <HookExtractor
        open={hooksOpen}
        onClose={() => setHooksOpen(false)}
        ads={displayAds}
        onSelectAd={(id) => {
          const ad = displayAds.find((a: Ad) => a.id === id);
          if (ad) { setSelectedAd(ad); setModalOpen(true); setHooksOpen(false); }
        }}
      />

      <CompanyDrawer
        company={selectedBulkCompany}
        open={companyDrawerOpen}
        onClose={() => setCompanyDrawerOpen(false)}
        onAdClick={(ad) => { setSelectedAd(ad); setModalOpen(true); }}
      />
    </div>
  );
}
