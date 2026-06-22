'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdGrid } from '@/components/ads/AdGrid';
import { AdModal } from '@/components/ads/AdModal';
import { FiltersPanel } from '@/components/ads/FiltersPanel';
import { ScrapeProgress } from '@/components/ads/ScrapeProgress';
import { CollectionsPanel } from '@/components/ads/CollectionsPanel';
import { HookExtractor } from '@/components/ads/HookExtractor';
import { BulkUpload } from '@/components/ads/BulkUpload';
import { BulkResultsTable } from '@/components/ads/BulkResultsTable';
import { CompanyDrawer } from '@/components/ads/CompanyDrawer';
import type { Ad, SearchParams, Collection, BulkCompany, BulkJob } from '@/types/ads';
import {
  Search, BookMarked, Users, Zap, FolderPlus, Download, SlidersHorizontal,
} from 'lucide-react';

const DEFAULT_PARAMS: SearchParams = {
  country: 'US',
  status: 'ALL',
  limit: 100,
};

export default function HomePage() {
  // Search state
  const [keyword, setKeyword] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [filterParams, setFilterParams] = useState<SearchParams>(DEFAULT_PARAMS);
  const [sortBy, setSortBy] = useState('scraped_at');

  // Scrape state
  const [scraping, setScraping] = useState(false);
  const [scrapeCount, setScrapeCount] = useState(0);
  const [liveAds, setLiveAds] = useState<Ad[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
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

  // Bulk state
  const [bulkJobId, setBulkJobId] = useState<string | null>(null);
  const [bulkJob, setBulkJob] = useState<BulkJob | null>(null);
  const [bulkCompanies, setBulkCompanies] = useState<BulkCompany[]>([]);
  const [selectedBulkCompany, setSelectedBulkCompany] = useState<BulkCompany | null>(null);
  const [companyDrawerOpen, setCompanyDrawerOpen] = useState(false);

  // Collections query
  const { data: collections = [], refetch: refetchCollections } = useQuery<Collection[]>({
    queryKey: ['collections'],
    queryFn: () => fetch('/api/collections').then((r) => r.json()),
  });

  // Saved ads query
  const { data: savedData, refetch: refetchSaved } = useQuery({
    queryKey: ['saved-ads', activeCollection, sortBy],
    queryFn: () => {
      const params = new URLSearchParams({ saved: 'true', limit: '200', sort: sortBy });
      if (activeCollection) params.set('collection_id', activeCollection);
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

  async function startBulkScrape(jobId: string) {
    setBulkJobId(jobId);
    setBulkCompanies([]);

    const res0 = await fetch(`/api/bulk/${jobId}/results`);
    const data0 = await res0.json();
    setBulkJob(data0.job);
    setBulkCompanies(data0.companies);

    const sse = await fetch(`/api/bulk/${jobId}/stream`);
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
            if (event.type === 'company_start') {
              setBulkCompanies((prev) =>
                prev.map((c) => (c.id === event.company_id ? { ...c, status: 'scraping' } : c))
              );
            }
            if (event.type === 'company_done') {
              setBulkCompanies((prev) =>
                prev.map((c) => (c.id === event.company_id ? { ...c, ...event.result } : c))
              );
              setBulkJob((j) =>
                j ? { ...j, completed_companies: (j.completed_companies || 0) + 1 } : j
              );
            }
            if (event.type === 'done') {
              setBulkJob((j) => (j ? { ...j, status: 'complete' } : j));
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* stream ended */ }
  }

  const sortedAds = [...liveAds].sort((a, b) => {
    if (sortBy === 'days_running') return (b.days_running ?? 0) - (a.days_running ?? 0);
    if (sortBy === 'started_at') return (b.started_at ?? '').localeCompare(a.started_at ?? '');
    return (b.scraped_at ?? '').localeCompare(a.scraped_at ?? '');
  });

  const displayAds = tab === 'saved' ? (savedData?.ads || []) : sortedAds;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Filters sidebar */}
      {showFilters && tab === 'search' && (
        <aside className="w-56 border-r shrink-0 overflow-hidden flex flex-col">
          <FiltersPanel
            params={filterParams}
            onChange={(p) => setFilterParams((prev) => ({ ...prev, ...p }))}
            onReset={() => setFilterParams(DEFAULT_PARAMS)}
            collections={collections}
            activeCollection={activeCollection}
            onCollectionChange={setActiveCollection}
          />
        </aside>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top nav */}
        <header className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">Meta Ads Scraper</span>
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
                <Users className="w-3.5 h-3.5 mr-1" />Bulk Upload
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
                {liveAds.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => window.open(activeJobId ? `/api/export?format=csv&job_id=${activeJobId}` : '/api/export?format=csv', '_blank')} className="h-8 text-xs">
                      <Download className="w-3 h-3 mr-1" />CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(activeJobId ? `/api/export?format=json&job_id=${activeJobId}` : '/api/export?format=json', '_blank')} className="h-8 text-xs">
                      <Download className="w-3 h-3 mr-1" />JSON
                    </Button>
                  </>
                )}
              </>
            )}
            {tab === 'saved' && savedData?.total > 0 && (
              <Button size="sm" variant="outline" onClick={() => window.open('/api/export?saved=true', '_blank')} className="h-8 text-xs">
                <Download className="w-3 h-3 mr-1" />Export
              </Button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {/* Search Tab */}
          {tab === 'search' && (
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Keyword in ad copy..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startScrape()}
                    className="pl-9"
                  />
                </div>
                <div className="flex-1 relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Advertiser / page name..."
                    value={advertiser}
                    onChange={(e) => setAdvertiser(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startScrape()}
                    className="pl-9"
                  />
                </div>
                <Button onClick={startScrape} disabled={scraping} className="px-6">
                  {scraping ? 'Scraping...' : 'Scrape'}
                </Button>
              </div>

              {(liveAds.length > 0 || scraping) && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{liveAds.length} ads found</span>
                    {liveAds.some((a) => a.is_new) && (
                      <Badge className="bg-blue-500 text-xs">
                        {liveAds.filter((a) => a.is_new).length} new
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sort:</span>
                    <Select value={sortBy} onValueChange={(v) => v && setSortBy(v)}>
                      <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scraped_at" className="text-xs">Most Recent</SelectItem>
                        <SelectItem value="days_running" className="text-xs">Days Running ↓</SelectItem>
                        <SelectItem value="started_at" className="text-xs">Start Date ↓</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <AdGrid
                ads={sortedAds}
                loading={scraping && liveAds.length === 0}
                hasSearched={hasSearched}
                onAdClick={(ad) => { setSelectedAd(ad); setModalOpen(true); }}
                onSave={handleSave}
              />

              {!scraping && liveAds.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Zap className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">Ready to scrape</p>
                  <p className="text-sm text-muted-foreground mt-1">Enter a keyword or advertiser name and click Scrape</p>
                </div>
              )}
            </div>
          )}

          {/* Saved Tab */}
          {tab === 'saved' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">Saved Ads</h2>
                  {savedData?.total > 0 && <Badge variant="secondary">{savedData.total}</Badge>}
                </div>
                <Button size="sm" variant="outline" onClick={() => setCollectionsOpen(true)} className="h-8 text-xs">
                  <FolderPlus className="w-3 h-3 mr-1" />Manage Collections
                </Button>
              </div>

              {collections.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setActiveCollection(null)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${!activeCollection ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border'}`}
                  >
                    All saved
                  </button>
                  {collections.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCollection(c.id)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${activeCollection === c.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border'}`}
                    >
                      📁 {c.name} {c.ad_count != null ? `(${c.ad_count})` : ''}
                    </button>
                  ))}
                </div>
              )}

              <AdGrid
                ads={savedData?.ads || []}
                loading={false}
                onAdClick={(ad) => { setSelectedAd(ad); setModalOpen(true); }}
                onSave={handleSave}
              />
            </div>
          )}

          {/* Bulk Tab */}
          {tab === 'bulk' && (
            <div className="p-6">
              {!bulkJobId ? (
                <BulkUpload onStart={startBulkScrape} />
              ) : (
                <div className="space-y-4">
                  <Button size="sm" variant="outline" onClick={() => { setBulkJobId(null); setBulkJob(null); setBulkCompanies([]); }}>
                    ← New Bulk Job
                  </Button>
                  {bulkJob && (
                    <BulkResultsTable
                      job={bulkJob}
                      companies={bulkCompanies}
                      onCompanyClick={(c) => { setSelectedBulkCompany(c); setCompanyDrawerOpen(true); }}
                      onExport={() => window.open(`/api/bulk/${bulkJobId}/export`, '_blank')}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Overlays */}
      <AdModal ad={selectedAd} open={modalOpen} onClose={() => setModalOpen(false)} />

      <ScrapeProgress running={scraping} count={scrapeCount} onStop={stopScrape} />

      <CollectionsPanel
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
        collections={collections}
        onCreate={createCollection}
        onDelete={deleteCollection}
      />

      <HookExtractor open={hooksOpen} onClose={() => setHooksOpen(false)} ads={displayAds} />

      <CompanyDrawer
        company={selectedBulkCompany}
        open={companyDrawerOpen}
        onClose={() => setCompanyDrawerOpen(false)}
        onAdClick={(ad) => { setSelectedAd(ad); setModalOpen(true); }}
      />
    </div>
  );
}
