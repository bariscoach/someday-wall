import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.warn('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set — API calls will fail.');
}

export const sb = createClient(url || '', key || '', {
  auth: { persistSession: false, autoRefreshToken: false }
});

/* Server-side moderation. Keep this list boring and short; it is a backstop,
   not the main filter. The browser also runs a check before submitting. */
const BLOCKED = [
  'stupid', 'idiot', 'ugly', 'kill yourself', 'kys',
  'nigger', 'faggot', 'retard', 'rape', 'cunt'
];
const URL_RE = /(https?:\/\/|www\.|\.com\b|\.net\b|\.io\b)/i;

export function checkText(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();

  if (text.length < 2)   return { ok: false, why: 'Write a little more.' };
  if (text.length > 140) return { ok: false, why: 'That is longer than 140 characters.' };
  if (URL_RE.test(text)) return { ok: false, why: 'Links are not allowed on the wall.' };

  const lower = text.toLowerCase();
  if (BLOCKED.some(w => lower.includes(w))) {
    return { ok: false, why: 'That did not pass moderation — try rephrasing.' };
  }
  /* shouting */
  const letters = text.replace(/[^a-z]/gi, '');
  if (letters.length > 8 && text === text.toUpperCase()) {
    return { ok: false, why: 'Please write it in lower case.' };
  }
  return { ok: true, text };
}

const HEX = /^#[0-9a-f]{6}$/i;
export function checkColor(c) {
  return HEX.test(String(c || '')) ? c : '#C0552F';
}

export function checkVoter(v) {
  const s = String(v || '');
  return /^[a-z0-9-]{8,64}$/i.test(s) ? s : null;
}

/* Very light per-instance rate limit. Survives only as long as the warm
   function instance does — good enough to blunt accidental spam. For real
   protection add Vercel's WAF rules or an Upstash-backed counter. */
const seen = new Map();
export function rateLimit(id, max = 8, windowMs = 60_000) {
  const now = Date.now();
  const hits = (seen.get(id) || []).filter(t => now - t < windowMs);
  hits.push(now);
  seen.set(id, hits);
  if (seen.size > 5000) seen.clear();
  return hits.length <= max;
}
