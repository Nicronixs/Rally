-- Rangliste "Strecke der Woche" für Rally Koop.
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.
-- Jeder darf Zeiten der laufenden Woche eintragen und alle Zeiten lesen;
-- ändern oder löschen kann niemand über die öffentliche Schnittstelle.

create table if not exists public.weekly_times (
  id bigint generated always as identity primary key,
  week text not null,                -- ISO-Woche, z. B. '2026-W48'
  name text not null,
  time_ms integer not null,          -- Etappenzeit inkl. Strafen
  penalty_ms integer not null default 0,
  car text not null,
  created_at timestamptz not null default now(),
  constraint weekly_name_len check (char_length(btrim(name)) between 2 and 20),
  constraint weekly_time_range check (time_ms between 30000 and 3600000),
  constraint weekly_penalty_range check (penalty_ms between 0 and time_ms),
  constraint weekly_car check (car in ('falke', 'fuchs', 'bison')),
  constraint weekly_week_format check (week ~ '^[0-9]{4}-W[0-9]{2}$')
);

create index if not exists weekly_times_week_time on public.weekly_times (week, time_ms);

alter table public.weekly_times enable row level security;

drop policy if exists "weekly read" on public.weekly_times;
create policy "weekly read" on public.weekly_times
  for select to anon, authenticated using (true);

-- nur Einträge für die aktuelle Woche (UTC), damit keine alten Wochen nachträglich gefüllt werden
drop policy if exists "weekly insert current week" on public.weekly_times;
create policy "weekly insert current week" on public.weekly_times
  for insert to anon, authenticated
  with check (week = to_char(now() at time zone 'utc', 'IYYY-"W"IW'));

grant select, insert on public.weekly_times to anon, authenticated;
