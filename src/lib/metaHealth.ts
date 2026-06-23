// ---------------------------------------------------------------------------
// Meta API health registry
//
// The scraper depends on reverse-engineered Meta GraphQL queries whose names
// Meta rotates over time (e.g. AdLibraryV3AdDetailsQuery, the typeahead query).
// When a name changes, the old behaviour was to silently capture nothing and
// return empty results — indistinguishable from "no matches". This registry
// records, per integration point, whether we last succeeded or failed to talk
// to Meta, so the UI can flag "Meta changed their API" loudly instead of
// showing a misleading empty state.
//
// In-memory only (per server process) — this is a local, single-user tool.
// ---------------------------------------------------------------------------

export type MetaSignal = 'typeahead' | 'ad_details' | 'search';
export type SignalStatus = 'ok' | 'down' | 'unknown';

export const SIGNAL_LABELS: Record<MetaSignal, string> = {
  typeahead: 'Advertiser typeahead',
  ad_details: 'Ad details / EU transparency',
  search: 'Ad search',
};

// The Meta GraphQL query each signal depends on — surfaced in health output so
// a future maintainer knows exactly what to re-check when something goes down.
export const SIGNAL_QUERY: Record<MetaSignal, string> = {
  typeahead: 'useAdLibraryTypeaheadSuggestionDataSourceQuery',
  ad_details: 'AdLibraryV3AdDetailsQuery',
  search: 'ad_archive_id payload',
};

interface SignalState {
  status: SignalStatus;
  message: string;
  lastOk: number | null;
  lastDown: number | null;
  lastCheck: number | null;
}

function blank(): SignalState {
  return { status: 'unknown', message: '', lastOk: null, lastDown: null, lastCheck: null };
}

const state: Record<MetaSignal, SignalState> = {
  typeahead: blank(),
  ad_details: blank(),
  search: blank(),
};

/** Thrown when a Meta GraphQL query signature can't be captured (likely renamed). */
export class MetaSignatureError extends Error {
  readonly code = 'META_API_CHANGED' as const;
  readonly signal: MetaSignal;
  constructor(signal: MetaSignal, message: string) {
    super(message);
    this.name = 'MetaSignatureError';
    this.signal = signal;
  }
}

export function recordOk(signal: MetaSignal): void {
  const now = Date.now();
  const s = state[signal];
  s.status = 'ok';
  s.message = '';
  s.lastOk = now;
  s.lastCheck = now;
}

export function recordDown(signal: MetaSignal, message: string): void {
  const now = Date.now();
  const s = state[signal];
  s.status = 'down';
  s.message = message;
  s.lastDown = now;
  s.lastCheck = now;
}

export interface MetaHealthSnapshot {
  status: SignalStatus; // worst-of: 'down' if any down, else 'ok' if any ok, else 'unknown'
  checkedAt: number;
  signals: Array<{
    signal: MetaSignal;
    label: string;
    query: string;
    status: SignalStatus;
    message: string;
    lastOk: number | null;
    lastDown: number | null;
    lastCheck: number | null;
  }>;
}

export function snapshot(): MetaHealthSnapshot {
  const signals = (Object.keys(state) as MetaSignal[]).map((signal) => ({
    signal,
    label: SIGNAL_LABELS[signal],
    query: SIGNAL_QUERY[signal],
    ...state[signal],
  }));
  const overall: SignalStatus = signals.some((s) => s.status === 'down')
    ? 'down'
    : signals.some((s) => s.status === 'ok')
      ? 'ok'
      : 'unknown';
  return { status: overall, checkedAt: Date.now(), signals };
}

/** Convenience for one signal's current status. */
export function signalStatus(signal: MetaSignal): SignalStatus {
  return state[signal].status;
}
