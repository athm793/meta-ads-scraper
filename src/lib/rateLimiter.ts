// ---------------------------------------------------------------------------
// Meta request backoff + optional proactive throttle
//
// REACTIVE BY DEFAULT: in normal operation acquire() returns immediately — no
// global pacing. We only slow down *after* Meta actually pushes back (HTTP
// 429/403 or a "try again later" body), at which point a short cooldown makes
// every request wait it out, then it lifts once Meta serves cleanly again.
//
// An earlier version proactively capped the whole process to a few requests/sec
// via a token bucket. With many bulk workers that throttle strangled throughput
// (companies never finished), so the proactive cap is now OFF unless explicitly
// enabled with META_RATE_PER_SEC.
//
//   META_RATE_PER_SEC   opt-in sustained requests/sec across everything (unset = off)
//   META_RATE_BURST     bucket capacity for short bursts (default 8, only if rate set)
// ---------------------------------------------------------------------------

function numOrNull(v: string | undefined, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(max, Math.max(min, n));
}

// Proactive throttle is opt-in. null = disabled (default).
const RATE_PER_SEC = numOrNull(process.env.META_RATE_PER_SEC, 0.1, 50);
const BURST = numOrNull(process.env.META_RATE_BURST, 1, 100) ?? 8;

// Gentle backoff: short base, modest cap, quick recovery — enough to ride out a
// transient rate-limit without freezing the whole run.
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_BLOCK_EXP = 5; // cap the exponent so 10 simultaneous blocks don't pin the cooldown

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
  consecutiveBlocks = Math.min(MAX_BLOCK_EXP, consecutiveBlocks + 1);
  const raw = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (consecutiveBlocks - 1));
  const jittered = raw * (0.7 + Math.random() * 0.6); // ±30% so workers don't sync up
  cooldownUntil = Math.max(cooldownUntil, Date.now() + jittered);
  lastBlockAt = Date.now();
}

/** Signal a clean response. Recovers quickly so one block doesn't linger. */
export function reportOk(): void {
  consecutiveBlocks = 0;
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

// ---- optional token bucket (only used when RATE_PER_SEC is set) ----
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
    for (;;) {
      this.refill();
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      const waitMs = ((1 - this.tokens) / this.ratePerSec) * 1000;
      await sleep(Math.max(50, waitMs));
    }
  }
}

const bucket = RATE_PER_SEC ? new TokenBucket(RATE_PER_SEC, BURST) : null;

/**
 * Wait until it's safe to make one request to Meta.
 * - Always waits out an active post-block cooldown (reactive backoff).
 * - Only applies proactive pacing if META_RATE_PER_SEC was set.
 */
export async function acquire(): Promise<void> {
  let cd = cooldownRemaining();
  while (cd > 0) {
    await sleep(Math.min(cd, 1500));
    cd = cooldownRemaining();
  }
  if (bucket) await bucket.take();
}

// ---- block detection helpers ----
export function isBlockStatus(status: number): boolean {
  return status === 429 || status === 403;
}

export function looksBlocked(text: string): boolean {
  if (!text) return false;
  return /too many requests|rate limit|temporarily blocked|try again later|please wait a few minutes/i.test(text);
}
