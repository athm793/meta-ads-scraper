import path from 'path';
import fs from 'fs';
import type { ProxySetting } from './proxies';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chromiumWithStealth: any = null;

async function getChromium() {
  if (chromiumWithStealth) return chromiumWithStealth;
  const { chromium } = await import('playwright-extra');
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  chromium.use(StealthPlugin());
  chromiumWithStealth = chromium;
  return chromiumWithStealth;
}

const PROFILE_DIR = path.join(process.cwd(), 'data', 'browser-profile');

// Every browser we launch is tracked here so we can guarantee teardown — both
// when a scrape finishes and when the process is shutting down. Without this,
// a browser whose context/page creation throws (common under heavy concurrency)
// would leak with no reference left to close it.
const liveBrowsers = new Set<import('playwright').Browser>();
let shutdownHooked = false;

export function liveBrowserCount(): number {
  return liveBrowsers.size;
}

/** Close every tracked browser. Best-effort; used on process shutdown. */
export async function closeAllBrowsers(): Promise<void> {
  const all = [...liveBrowsers];
  liveBrowsers.clear();
  await Promise.all(all.map((b) => b.close().catch(() => {})));
}

function ensureShutdownHook(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  // Best-effort: race to kill headless Chromium when the server stops or
  // crashes, so browsers don't orphan. We don't call process.exit — other
  // listeners (e.g. Next.js) own the actual shutdown.
  const onSignal = () => { void closeAllBrowsers(); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  process.once('beforeExit', onSignal);
}

export async function launchBrowser(headless = true) {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
  ensureShutdownHook();
  const chromium = await getChromium();
  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
  liveBrowsers.add(browser);
  // Drop from the registry if it dies/closes on its own.
  browser.on('disconnected', () => liveBrowsers.delete(browser));
  return browser;
}

/** Close a browser and stop tracking it. Always use this instead of browser.close(). */
export async function closeBrowser(browser?: import('playwright').Browser): Promise<void> {
  if (!browser) return;
  liveBrowsers.delete(browser);
  await browser.close().catch(() => {});
}

export async function createContext(browser: import('playwright').Browser, proxy?: ProxySetting) {
  const viewportWidth = 1280 + Math.floor(Math.random() * 640);
  const viewportHeight = 768 + Math.floor(Math.random() * 312);

  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: [],
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    ...(proxy ? { proxy } : {}),
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  return context;
}

export function randomDelay(min = 800, max = 2500): Promise<void> {
  const ms = min + Math.floor(Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, ms));
}
