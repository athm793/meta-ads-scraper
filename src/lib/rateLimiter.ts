// ---------------------------------------------------------------------------
// Global Meta request rate limiter + adaptive backoff
//
// Every outbound request to Meta (page navigation, pagination scroll, in-page
// detail/typeahead GraphQL replays) funnels through one process-wide token
// bucket. This caps how fast we hit Meta no matter how many bulk workers run
// in parallel, and an exponential cooldown kicks in the moment Meta signals a
// block (HTTP 429/403 or a "try again later" body) so we back off instead of
// hammering a closed door.
//
// All knobs are env-tunable; defaults are conservative for a single IP.
//   META_RATE_PER_SEC   sustained requests/sec across everything (default 3)
//   META_RATE_BURST     bucket capacity for short bursts        (default 6)
// ---------------------------------------------------------------------------

const RATE_PER_SEC = clampNum(process.env.META_RATE_PER_SEC, 3, 0.1, 50);
const BURST = clampNum(process.env.META_RATE_BURST, 6, 1, 100);

const BASE_BACKOFF_MS = 4_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

function clampNum(v: string | undefined, dflt: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(max, Math.max(min, n));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- backoff state (shared) ----
let consecutiveBlocks = 0;
let cooldownUntil = 0;
let lastBlockAt = 0;

function cooldownRemaining(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

/** Signal that Meta pushed back (429/403/block page). Grows the cooldown. */
export function reportBlocked(): void {
  consecutiveBlocks += 1;
  const raw = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (consecutiveBlocks - 1));
  const jittered = raw * (0.8 + Math.random() * 0.4); // ±20% so workers don't sync up
  cooldownUntil = Math.max(cooldownUntil, Date.now() + jittered);
  lastBlockAt = Date.now();
}

/** Signal a clean response. Gently unwinds the backoff exponent. */
export function reportOk(): void {
  if (consecutiveBlocks > 0) consecutiveBlocks -= 1;
}

export interface RateLimitState {
  coolingDown: boolean;
  cooldownMs: number;
  consecutiveBlocks: number;
  lastBlockAt: number;
}

export function rateLimitState(): RateLimitState {
  return {
    coolingDown: cooldownRemaining() > 0,
    cooldownMs: cooldownRemaining(),
    consecutiveBlocks,
    lastBlockAt,
  };
}

/** True if Meta pushed back at any point at/after the given timestamp. */
export function throttledSince(ts: number): boolean {
  return lastBlockAt >= ts && lastBlockAt > 0;
}

// ---- token bucket ----
class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly ratePerSec: number, private readonly burst: number) {
    this.tokens = burst;
    this.last = Date.now();
  }
  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
    this.last = now;
  }
  async take(): Promise<void> {
    // Always wait out an active cooldown before spending a token.
    for (;;) {
      const cd = cooldownRemaining();
      if (cd > 0) { await sleep(Math.min(cd, 2000)); continue; }
      this.refill();
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      const waitMs = ((1 - this.tokens) / this.ratePerSec) * 1000;
      await sleep(Math.max(50, waitMs));
    }
  }
}

const bucket = new TokenBucket(RATE_PER_SEC, BURST);

/** Wait until it's safe to make one request to Meta. Respects active cooldowns. */
export function acquire(): Promise<void> {
  return bucket.take();
}

// ---- block detection helpers ----
export function isBlockStatus(status: number): boolean {
  return status === 429 || status === 403;
}

export function looksBlocked(text: string): boolean {
  if (!text) return false;
  return /too many requests|rate limit|temporarily blocked|try again later|please wait a few minutes/i.test(text);
}
