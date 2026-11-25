// Online leaderboard "Strecke der Woche" (stage of the week) on Supabase, via its REST API.
// Configured at build time: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the anon key is public by design;
// the table's row-level security in supabase/weekly.sql decides what it may do).
import { ENVIRONMENTS } from './environments.js';

// accept the project URL with or without the "/rest/v1/" that Supabase shows next to its Data API
const URL_BASE = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const leaderboardReady = !!(URL_BASE && ANON_KEY);

// Legacy anon keys are JWTs ("eyJ…") and also go into the Authorization header;
// the newer publishable keys ("sb_publishable_…") belong only in the apikey header.
const headers = () => ({
  apikey: ANON_KEY,
  ...(ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${ANON_KEY}` } : {}),
  'Content-Type': 'application/json',
});

// ISO 8601 week in UTC, e.g. { id: '2026-W48', start: Date (Monday), end: Date (next Monday) }
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday decides the year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (((date.getUTCDay() || 7)) - 1)));
  const end = new Date(start.getTime() + 7 * 86400000);
  return { id: `${year}-W${String(week).padStart(2, '0')}`, year, week, start, end };
}

// Same stage for everybody: seed and surface follow from the week.
export function weeklyStage(w = isoWeek()) {
  let h = 2166136261;
  for (const ch of `rally-${w.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const seed = (Math.abs(h) % 99990) + 10;
  const envIds = Object.keys(ENVIRONMENTS);
  const env = envIds[(w.year * 53 + w.week) % envIds.length];
  return { seed, env };
}

// Best time per driver name for a week, fastest first.
export async function fetchWeekly(week, limit = 50) {
  if (!leaderboardReady) throw new Error('Rangliste ist noch nicht eingerichtet.');
  const q = `${URL_BASE}/rest/v1/weekly_times?select=name,time_ms,penalty_ms,car,created_at&week=eq.${encodeURIComponent(week)}&order=time_ms.asc&limit=500`;
  const res = await fetch(q, { headers: headers() });
  if (!res.ok) throw new Error(`Rangliste nicht erreichbar (${res.status})`);
  const rows = await res.json();
  const seen = new Set();
  const best = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    best.push(r);
    if (best.length >= limit) break;
  }
  return best;
}

export async function submitWeekly({ week, name, timeMs, penaltyMs, car }) {
  if (!leaderboardReady) throw new Error('Rangliste ist noch nicht eingerichtet.');
  const res = await fetch(`${URL_BASE}/rest/v1/weekly_times`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=minimal' },
    body: JSON.stringify({ week, name: name.trim(), time_ms: Math.round(timeMs), penalty_ms: Math.round(penaltyMs), car }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(res.status === 401 || res.status === 403 ? 'Eintragen nicht erlaubt (Woche abgelaufen?)' : `Eintragen fehlgeschlagen (${res.status}) ${text.slice(0, 80)}`);
  }
}

export const NAME_KEY = 'rally.playerName';
