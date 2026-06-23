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
- **Advertiser typeahead** — start typing a brand and pick the matching Meta page from a live dropdown (logo, verified badge, category, follower count), then scrape that exact page's ads instead of a fuzzy keyword match.
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
A swipe-file and analytics workbench built from the opening line of every ad:
- **Auto angle-classification** — each hook is tagged as Question / Stat / How-to / Offer / Urgency / Curiosity / Social proof / Emoji-led / Statement.
- **Filter by angle**, search, and collapse duplicates ("unique angles" ranked by how many advertisers run them).
- **Stats** — angle distribution (with advertiser counts and average days-running per angle), top CTAs, media mix, most active advertisers, hook length.
- **Trends** — which angles are rising or falling week over week across your whole database.
- **Headline + CTA extraction** alongside hooks (full swipe file, not just first lines).
- Click any hook to **jump to its ad**. Copy individually or export the whole swipe file to CSV.

### 🏢 Bulk Company Intelligence
Check the Meta ad activity of a whole list of companies at once:
- Upload a **CSV** (with automatic column mapping) or paste a list — **deduplicated** on import, with a compact summary instead of re-dumping the whole file.
- **Brand-page matching, not just keyword** — for each company the scraper resolves the actual Meta advertiser page. Supply a **country** to look up the brand in and an optional **company type / category** column so it picks the *right* page when several brands share a name, instead of grabbing the first match.
- Scrapes companies **in parallel** with a configurable **1–20 workers** (your setting is remembered between runs).
- Per-company results: matched page name, active/inactive ad counts, ad types, platforms, spend range, last-ad date.
- **Shared deduplication** across companies.
- **Scope filters** per job: status, media types, platforms, and optional "fetch ad details".
- Full **job control** — pause, resume, stop, archive, and delete — from both the job list and inside a job, with live status updates.
- Job history with live progress, and exports for **company summaries** and **per-ad data (with details)**.

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

## Notes & responsible use

- This reads only the **publicly available** Meta Ad Library. Use it for legitimate competitive and creative research, and respect Meta's Terms of Service.
- Some data (spend, impressions, and the demographic/reach breakdowns) is only published by Meta for **political/issue ads** or **ads that ran in the EU**. Blank values there are a Meta limitation, not a scraper failure.
- Scraping speed depends on your machine and network; the Ad Library can also rate-limit aggressive use.

---

## License

**Proprietary — © 2026 athm793. All rights reserved.** See [LICENSE](LICENSE). This source is private and confidential; no copying, distribution, or use is permitted without prior written consent.
