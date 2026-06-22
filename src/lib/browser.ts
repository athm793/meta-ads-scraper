import path from 'path';
import fs from 'fs';

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

export async function launchBrowser(headless = true) {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
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
  return browser;
}

export async function createContext(browser: import('playwright').Browser) {
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
