# Meta Ads Scraper

A local, self-hosted tool for searching and analyzing the **public [Meta Ad Library](https://www.facebook.com/ads/library/)** — Facebook & Instagram ads — as a competitive-research and creative swipe-file workbench.

> **Proprietary software — see [License](#license). All rights reserved.**

> **No API key. No access token. No account.**
> It drives a real headless browser (Playwright) against the public Ad Library, reads the same data the website does, and stores everything in a local SQLite file on your machine. Nothing leaves your computer.

---

## Why this exists

The Meta Ad Library is public but painful to research at scale: no bulk export, no tagging, no analytics, no way to compare competitors or track creative angles over time. This tool turns it into a proper research database you fully own.

---

## Features

### 🔎 Search
- **Keyword** search (matches ad copy) and **advertiser / page** search.
- **Advertiser typeahead** — start typing a brand and pick the matching Meta page from a live dropdown (logo, verified badge, **Facebook + Instagram handles**, follower counts, category), then scrape that exact page's ads instead of a fuzzy keyword match.
- **Deep search is always on** — every search scrapes the advertiser's full library sorted by impressions and pulls the "See ad details" data for every ad. No toggle to forget.
- Pre-scrape filters: country, language, category (incl. political/issue, housing, employment, credit), media type, platform, status (active/inactive), date range, and result cap.
- **Persistent filters** — your filter and option choices are remembered between runs (and the active tab and last job survive a refresh).
- **Live streaming results** — ads appear as they're found (server-sent events), with a stop button right next to Start.
- A **collapsible filter rail** you can close for more room and reopen from the left edge.
- Post-scrape result filters: free-text, status, and multi-select media type / platform.
- Centered pagination on both search and job views.

### 🖼️ Ad detail view
- Wide creative viewer for **image, video, carousel, and multi-video** ads, with **per-file download buttons** (named by advertiser + ad ID; multi-asset ads download as a zip).
- All **copy variants**, headline, CTA, and landing URL (one-click copy).
- **Dynamic / catalog ads handled** — Meta product-feed ads carry template tokens like `{{product.brand}}` that are filled per-viewer at delivery. Variants that are only tokens are recognised as having no real copy instead of being shown as blank `{{product.brand}}` text.
- Full metadata: status, platforms, days running, start/stop dates, spend & impression ranges (where Meta provides them), funding entity.
- **"See ad details" / EU transparency capture**: total EU reach, beneficiary, payer, plus **age/gender** and **per-country reach** breakdowns, charted in readable colors.
- **Per-ad export** (CSV) and **per-ad tagging** right from the modal.

### 🏷️ Saved ads, lists & tags
- Save/bookmark any ad.
- **Lists (collections)** — group saved ads, color-coded.
- **Tags** — create your own labels (many per ad), color them, and filter by them.
- **Search within** your saved ads, combined with list + tag filters.
- Export your saved/filtered set to CSV or JSON.

### 🪝 Hook Lab
A swipe-file and trend-intelligence workbench built from the opening line of every ad:
- **Auto angle-classification** — each hook is tagged as Question / Stat / How-to / Offer / Urgency / Curiosity / Social proof / Emoji-led / Statement.
- **Trend stages (creative-viability signal)** — every ad is labelled by how long it's been running: **Battle-tested** (30d+), **Gaining traction** (14–30d), or **New test** (<14d). Long-running ads are the ones advertisers keep because they keep performing. Filter by stage, **sort by longest-running** to surface proven winners, and see the **longest-running ad** for the query at a glance.
- **Filter by angle**, search, and collapse duplicates ("unique angles" ranked by how many advertisers run them; the longest-running instance of each hook is kept as the example).
- **Stats** — trend-stage distribution + average ad age + active count, angle distribution (with advertiser counts and average days-running per angle), top CTAs, media mix, most active advertisers.
- **Trends** — which angles are rising or falling week over week across your whole database.
- **Headline + CTA extraction** alongside hooks (full swipe file, not just first lines).
- Click any hook to **jump to its ad**. Copy individually or export the whole swipe file to CSV.

### 🏢 Bulk Company Intelligence
Check the Meta ad activity of a whole list of companies at once, via a guided upload wizard:
- Upload a **CSV** (with automatic column mapping) — **deduplicated** on import, with a compact summary instead of re-dumping the whole file.
- **Deterministic brand matching by social handle** — instead of guessing by name, the scraper opens each company's **website**, reads the Facebook/Instagram handle it links to, and matches that *exact* handle against Meta's advertiser pages (their handle is shown in the typeahead). It's an identity match, not a name guess, so it never scrapes the wrong same-named brand. A company it can't verify this way is flagged **Needs review** rather than mis-scraped. (A **Website** column is required for brand matching; an optional **Page URL / ID** column is an exact-page override; **Keyword** mode is available when you don't need a specific page.)
- Scrapes companies **in parallel** with a configurable **1–10 workers** (default 4; your setting is remembered between runs).
- Per-company results: matched page + verified handle, active/inactive ad counts, ad types, platforms, spend range, last-ad date.
- **Shared deduplication** across companies.
- **Scope filters** per job: status, media types, platforms, and optional "fetch ad details".
- Full **job control** — pause, resume, stop, archive, and delete — from both the job list and inside a job, with live status updates.
- Job history with live progress, and exports for **company summaries** and **per-ad data (with details)** — both include each brand's matched **Facebook / Instagram username** and how it was matched.

### 🪝 Real-time webhooks
Optionally push scraped data to an external system as it's found — no polling, no exports to wire up.
- **Search sessions** — a session is a named run on the Search tab with its own webhook. Press **Play** to make it live: ads scraped or saved while it's playing are pushed to its URL in real time. Press **Pause** to stop (a paused session disappears from the Sessions button so there's no ambiguity about what's live). One session plays at a time. Configurable per session: fire **on save** (only ads you bookmark), **on scrape** (every ad as it streams in), or **both**. A live session with no webhook URL just groups its ads (no firing).
- **Bulk jobs** — enable a webhook in the upload wizard and each company fires a call as it finishes, carrying the company summary (matched page, handles, ad counts, spend range) **plus that company's ads** in one payload.
- **One schema for both** — search and bulk fires share the **same JSON body** so you build a single integration. Every payload is `{ event, sent_at, source, job_id, company, ads }`: `company` is always the same shape (a bulk company summary; for search ads it's synthesised from the advertiser, with handle/website fields `null`), and `ads` is always an array of full ad objects. `event`/`source` tell you where it came from (`bulk.company_done`, `search.ad_saved`, `search.ad_scraped`) without needing a second parser; search fires add `session_id`/`session_name` as extra context.
- **Signed & safe** — set an optional secret and every body is HMAC-SHA256 signed (`X-Webhook-Signature: sha256=…`), alongside `X-Webhook-Event`. Delivery is **non-blocking and fire-and-forget**: a slow or failing webhook never slows or stops a scrape; failed calls retry with backoff and are logged, not surfaced as scrape errors.
- **Test fire before you commit** — a **Send test** button next to every webhook URL (bulk wizard + session config) POSTs a sample `webhook.test` payload and reports the result inline (`Delivered (200)` or the failure reason), so you can confirm the endpoint is reachable before starting a job or activating a session.

### 📤 Exports
- CSV (with a **UTF-8 BOM** so Excel renders emojis and accents correctly) and JSON.
- Includes media URLs and the EU-transparency columns; files are named with context + timestamp.

### 💾 Local persistence
All scraped ads, collections, tags, and jobs live in a local **SQLite** database (`data/ads.db`). Your research stays on your machine.

---

## How it works (and why it needs no API)

Meta's official Ad Library API requires approval and is heavily restricted. This tool sidesteps that entirely: it launches a **stealth headless Chromium** via [Playwright](https://playwright.dev/), loads the **public** Ad Library web pages, and reads the JSON the site already sends to your browser. For deep "ad details," it replays the page's own GraphQL request from inside the browser context.

That means no API keys, no tokens, and no approval process — just the public data, read on your own machine.

---

## Requirements

- **Node.js 20+**
- A one-time Playwright Chromium download (≈ a few hundred MB)

No database server, no API credentials, no cloud account.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Install the browser Playwright drives (one-time)
npx playwright install chromium

# 3. Run
npm run dev
```

Then open **http://localhost:3000**.

**Windows:** double-click `start-dev.bat` — it installs deps on first run, starts the dev server, and opens the browser for you.

### Build for production
```bash
npm run build
npm start
```

> **Deployment caveat — run this as a single long-lived Node process.**
> The app is designed to run on one persistent server (local machine, a VM, or a single container). The rate limiter, adaptive backoff, the Meta-API health registry, and the warm typeahead browser all hold **in-memory, per-process** state. On a serverless platform (e.g. Vercel functions) where each request can hit a fresh, isolated instance, that shared state stops being global: every cold instance starts with an empty token bucket and no backoff history, so the global rate limiting and "Meta changed their API" tracking no longer hold across requests. Playwright driving a headless Chromium also doesn't fit typical serverless function limits. If you move off a single process, you'd need to externalise that state (e.g. Redis for the limiter/health) and run the browser on a dedicated worker.

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + shadcn-style UI + **Framer Motion** + **Recharts**
- **TanStack Query** for data fetching/caching
- **better-sqlite3** for local persistence
- **Playwright** (+ stealth plugin) for scraping

---

## Project layout

```
src/
  app/
    page.tsx              # Main UI (search / saved / bulk tabs)
    api/                  # Route handlers
      scrape/             # SSE keyword/advertiser search
      bulk/               # Bulk jobs: start, stream, control, export, results
      ads/                # Query, save, per-ad tags
      tags/  collections/ # Tag & list CRUD
      hooks/trends/       # Hook angle trends
      export/  download/  # CSV/JSON export, media proxy
  components/ads/         # AdGrid, AdModal, FiltersPanel, HookExtractor, BulkUpload, TagEditor, …
  lib/
    scraper.ts            # Playwright scraping + detail enrichment
    parser.ts             # Meta payload → Ad model
    hooks.ts              # Hook angle classification
    db.ts                 # SQLite schema + queries
    exportCsv.ts          # Shared CSV builder
```

---

## Rate limiting & proxies

The scraper reads the public Ad Library at a deliberately polite pace and adapts when Meta pushes back:

- **Reactive backoff (default)** — normal requests run at full speed. Only when Meta actually returns an HTTP 429/403 does a short cooldown (2s up to 60s, with jitter) kick in across all workers, lifting once Meta serves cleanly again. If a run gets throttled, the UI says so instead of silently returning partial data. (Detail "See ad details" requests are additionally paced with a per-request delay so a full brand library doesn't burst into a rate limit.)
- **Optional proactive throttle** — off by default. Set `META_RATE_PER_SEC` (and optionally `META_RATE_BURST`) to cap the whole process to a fixed requests/sec across every worker, for shared IPs or extra-cautious runs.
- **Conservative bulk concurrency** — bulk defaults to 4 parallel workers (capped at 10) with a jittered gap between companies. High worker counts from a single IP are the most common way to get throttled.
- **Optional proxy rotation** — fully opt-in for heavier use. Provide proxies via `META_SCRAPER_PROXIES` (comma-separated) or a `data/proxies.txt` file (one per line), formatted `[scheme://][user:pass@]host:port`. They're rotated round-robin per browser context. With none configured, the scraper connects directly, exactly as before.
- **Fails loudly when Meta changes their API** — the scraper depends on reverse-engineered Meta GraphQL queries whose names Meta rotates over time. If a query can't be captured (e.g. the typeahead or "See ad details" query was renamed), the affected feature surfaces a clear "Meta changed their API" warning instead of silently returning an empty result that looks like "no matches".
- **Health monitoring** — `GET /api/health/meta` reports the status of each Meta integration (typeahead, ad details, search), including the exact query each one depends on; add `?probe=1` for a live re-test. Returns 503 if anything is down — wire it to an uptime monitor.

## Notes & responsible use

- This reads only the **publicly available** Meta Ad Library. Use it for legitimate competitive and creative research, and respect Meta's Terms of Service.
- Some data (spend, impressions, and the demographic/reach breakdowns) is only published by Meta for **political/issue ads** or **ads that ran in the EU**. Blank values there are a Meta limitation, not a scraper failure.
- Scraping speed depends on your machine and network; the Ad Library can also rate-limit aggressive use.

---

## License

**Proprietary — © 2026 athm793. All rights reserved.** See [LICENSE](LICENSE). This source is private and confidential; no copying, distribution, or use is permitted without prior written consent.
