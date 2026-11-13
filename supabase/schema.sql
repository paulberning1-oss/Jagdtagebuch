-- Ansitzplaner: Cloud-Speicher pro Konto
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor → New query → alles einfügen → Run.
-- Kann gefahrlos mehrfach ausgeführt werden.

-- ---------- Datensätze ----------
-- Eine Tabelle für alle Arten von Einträgen (Einrichtungen, Grenzen, Ansitze, Sichtungen, …).
-- tbl = Name der Tabelle in der App, id = Schlüssel des Eintrags, data = der Eintrag als JSON.
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_updated on public.records (user_id, updated_at);

-- Zeitstempel immer vom Server (sonst könnten falsch gestellte Uhren Änderungen verstecken)
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- Jeder sieht und ändert nur seine eigenen Einträge
alter table public.records enable row level security;

drop policy if exists "eigene Einträge lesen" on public.records;
create policy "eigene Einträge lesen" on public.records
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "eigene Einträge anlegen" on public.records;
create policy "eigene Einträge anlegen" on public.records
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "eigene Einträge ändern" on public.records;
create policy "eigene Einträge ändern" on public.records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "eigene Einträge löschen" on public.records;
create policy "eigene Einträge löschen" on public.records
  for delete to authenticated using (user_id = auth.uid());

-- ---------- Fotos ----------
-- Privater Speicher-Bucket; jedes Konto hat einen eigenen Ordner <user_id>/
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "eigene Fotos lesen" on storage.objects;
create policy "eigene Fotos lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "eigene Fotos hochladen" on storage.objects;
create policy "eigene Fotos hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "eigene Fotos ersetzen" on storage.objects;
create policy "eigene Fotos ersetzen" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "eigene Fotos löschen" on storage.objects;
create policy "eigene Fotos löschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Wach-Ping ----------
-- Kostenlose Supabase-Projekte schlafen nach einer Woche ohne Nutzung ein.
-- Der GitHub-Workflow "Supabase wach halten" ruft diese Funktion regelmäßig auf.
create or replace function public.ping() returns text
language sql stable as $$ select 'ok'::text $$;

grant execute on function public.ping() to anon, authenticated;
