-- KI-Jagdassistent: Zähler für das Tageslimit (Teilschritt 6).
-- Einmal im Supabase-Dashboard unter „SQL Editor“ ausführen. Kann gefahrlos mehrfach ausgeführt werden.

create table if not exists public.ki_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.ki_usage enable row level security;

-- Jeder sieht nur seinen eigenen Zähler. Schreiben nur über die Funktionen unten.
drop policy if exists "ki_usage eigene lesen" on public.ki_usage;
create policy "ki_usage eigene lesen" on public.ki_usage for select using (auth.uid() = user_id);

-- Heutige Anfragen des angemeldeten Nutzers (Tag nach deutscher Zeit)
create or replace function public.ki_usage_today()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select count from public.ki_usage
      where user_id = auth.uid() and day = (now() at time zone 'Europe/Berlin')::date),
    0)
$$;

-- Eine Anfrage zählen, gibt den neuen Stand zurück
create or replace function public.ki_count_use()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'nicht angemeldet';
  end if;
  insert into public.ki_usage (user_id, day, count)
  values (auth.uid(), (now() at time zone 'Europe/Berlin')::date, 1)
  on conflict (user_id, day) do update set count = public.ki_usage.count + 1
  returning count into n;
  return n;
end
$$;

revoke all on function public.ki_usage_today() from public, anon;
revoke all on function public.ki_count_use() from public, anon;
grant execute on function public.ki_usage_today() to authenticated;
grant execute on function public.ki_count_use() to authenticated;
