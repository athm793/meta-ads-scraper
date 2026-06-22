import type { Ad } from '@/types/ads';

// Marketing "angle" taxonomy for ad hooks. An ad can match several angles; a
// single "primary" angle (first match by priority) is used for stats/trends.
export interface Angle { key: string; label: string; color: string }

export const ANGLES: Angle[] = [
  { key: 'question', label: 'Question', color: '#3b82f6' },
  { key: 'stat', label: 'Stat / Number', color: '#10b981' },
  { key: 'howto', label: 'How-to', color: '#8b5cf6' },
  { key: 'offer', label: 'Offer / Discount', color: '#f59e0b' },
  { key: 'urgency', label: 'Urgency', color: '#ef4444' },
  { key: 'curiosity', label: 'Curiosity / List', color: '#ec4899' },
  { key: 'social', label: 'Social proof', color: '#14b8a6' },
  { key: 'emoji', label: 'Emoji-led', color: '#eab308' },
  { key: 'statement', label: 'Statement', color: '#94a3b8' },
];

export const ANGLE_LABEL: Record<string, string> = Object.fromEntries(ANGLES.map((a) => [a.key, a.label]));
export const ANGLE_COLOR: Record<string, string> = Object.fromEntries(ANGLES.map((a) => [a.key, a.color]));

// Leading emoji / pictographic detection
const LEADING_EMOJI = /^\s*(?:[←-⇿⌀-➿⬀-⯿️‍]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF])/;

const RULES: Array<{ key: string; test: (t: string) => boolean }> = [
  { key: 'question', test: (t) => t.includes('?') },
  { key: 'howto', test: (t) => /\b(how to|how i|how we|ways? to|steps to|guide to|tips? to)\b/i.test(t) },
  { key: 'offer', test: (t) => /(\d+%\s*off|\bfree\b|\bsave\b|\bdeal\b|\bsale\b|\bdiscount\b|\bbogo\b|\bcoupon\b|\bpromo\b|% off)/i.test(t) },
  { key: 'urgency', test: (t) => /\b(now|today|hurry|limited|last chance|ends?(\s+soon)?|don'?t miss|act fast|while (stocks|supplies)|before (it'?s|they'?re)|ending soon|only \d)\b/i.test(t) },
  { key: 'curiosity', test: (t) => /\b(\d+\s+(ways|reasons|things|tips|secrets|mistakes|hacks)|secret|nobody|no one|what (no one|nobody)|the truth|this is why|you won'?t believe)\b/i.test(t) },
  { key: 'stat', test: (t) => /(\d+%|\$\s?\d|\d{3,}|\d+x\b|\bup to \d|\d+\s?(million|billion|k\b))/i.test(t) },
  { key: 'social', test: (t) => /\b(join|thousands|millions|loved by|trusted by|rated|reviews?|\d+\s+(customers|users|people|members))\b/i.test(t) },
  { key: 'emoji', test: (t) => LEADING_EMOJI.test(t) },
];

/** All angles a hook matches (always at least one — falls back to "statement"). */
export function classifyHook(text: string): string[] {
  const matches = RULES.filter((r) => r.test(text)).map((r) => r.key);
  return matches.length ? matches : ['statement'];
}

/** The single dominant angle (first match by the priority order in RULES). */
export function primaryAngle(text: string): string {
  return classifyHook(text)[0];
}

export interface HookRecord {
  id: string;
  advertiser: string;
  hook: string;
  headline?: string;
  cta?: string;
  mediaType: string;
  status: string;
  daysRunning?: number;
  angles: string[];
  primary: string;
}

export function adToHook(ad: Ad): HookRecord | null {
  const body = ad.body_variants?.[0];
  if (!body) return null;
  const hook = body.split('\n')[0].trim().slice(0, 240);
  if (!hook) return null;
  const angles = classifyHook(hook);
  return {
    id: ad.id,
    advertiser: ad.advertiser_name,
    hook,
    headline: ad.headline,
    cta: ad.cta_text,
    mediaType: ad.media_type,
    status: ad.status,
    daysRunning: ad.days_running,
    angles,
    primary: angles[0],
  };
}
