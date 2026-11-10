-- 011: accountant's "Lager lista" PDF.
--   lager_articles  every article seen in the uploaded PDFs (latest values);
--                   our articles link to one via articles.code.
--   lager_stock     Stanje per article per day, one row per upload date, so
--                   the book stock can be followed day by day.
--   articles.book_factor  1 of our counting unit = book_factor of the
--                   accountant's unit (1 bure = 20 l, 1 kesa espresa = 1 kg).
-- Safe to re-run.

create table if not exists lager_articles (
  code text primary key,
  name text not null,
  unit text not null default '',
  stanje double precision not null default 0,
  cena double precision not null default 0,
  as_of date not null
);

create table if not exists lager_stock (
  date date not null,
  code text not null,
  name text not null,
  unit text not null default '',
  ulaz double precision not null default 0,
  izlaz double precision not null default 0,
  stanje double precision not null default 0,
  cena double precision not null default 0,
  primary key (date, code)
);

alter table articles add column if not exists book_factor double precision not null default 1;

alter table lager_articles enable row level security;
alter table lager_stock enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lager_articles', 'lager_stock'] loop
    execute format('drop policy if exists member_read on %I', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy member_read on %I for select using (app_is_member())', t);
    execute format('create policy admin_write on %I for all using (app_is_admin()) with check (app_is_admin())', t);
  end loop;
end $$;

grant select, insert, update, delete on lager_articles, lager_stock to anon, authenticated;

notify pgrst, 'reload schema';
