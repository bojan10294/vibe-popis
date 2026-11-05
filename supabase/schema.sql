-- Popis — database schema for Supabase.
-- Run once: Supabase dashboard → SQL Editor → New query → paste all → Run.
-- Safe to re-run (drops nothing, uses IF NOT EXISTS / OR REPLACE).
--
-- Security model: the app uses the public (publishable) key, no Supabase Auth.
-- Workers log in with name + PIN through app_login(), which returns a session
-- token. The app sends it as the `x-session-token` header and every table's
-- row-level-security policy checks it. PIN hashes are never readable.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists app_users (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role text not null check (role in ('admin', 'staff')),
  pin_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists app_users_name_key on app_users (lower(name));

create table if not exists app_sessions (
  token text primary key,
  user_id text not null references app_users (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists suppliers (
  id text primary key,
  name text not null,
  phone text,
  sort_order integer not null default 0
);

create table if not exists articles (
  id text primary key,
  name text not null,
  category_id text references categories (id) on delete set null,
  supplier_id text references suppliers (id) on delete set null,
  kind text not null check (kind in ('count', 'weight', 'bottle', 'yes_no', 'espresso', 'text')),
  unit text not null,
  allow_decimal boolean not null default false,
  bottle_sizes jsonb not null default '[]'::jsonb,
  minimum double precision not null default 0,
  minimum_weekend double precision,
  order_qty double precision not null default 1,
  order_qty_weekend double precision,
  regular_target double precision,
  order_unit text not null default 'kom',
  pack_size double precision not null default 1,
  weekend_target double precision,
  ask_note boolean not null default false,
  count_weekday smallint check (count_weekday between 0 and 6),
  active boolean not null default true,
  sort_order integer not null default 0,
  code text,
  last_unit_price double precision not null default 0,
  book_stock double precision
);
create index if not exists articles_category_idx on articles (category_id);

create table if not exists counts (
  id text primary key,
  datetime timestamptz not null,
  finished_at timestamptz,
  user_id text not null,
  user_name text not null,
  status text not null check (status in ('in_progress', 'finished')),
  note text not null default '',
  done_categories jsonb not null default '[]'::jsonb,
  book_stock_as_of_date date
);
create index if not exists counts_status_idx on counts (status);

create table if not exists count_lines (
  id text primary key,
  count_id text not null references counts (id) on delete cascade,
  article_id text not null,
  article_name text not null,
  category_id text,
  unit text not null,
  input jsonb not null,
  counted double precision not null,
  book_stock double precision,
  difference double precision,
  unit_price double precision not null default 0,
  difference_value double precision,
  unique (count_id, article_id)
);

create table if not exists order_lines (
  id text primary key,
  count_id text not null references counts (id) on delete cascade,
  article_id text not null,
  article_name text not null,
  category_id text,
  unit text not null,
  kind text not null,
  counted double precision,
  minimum double precision not null default 0,
  suggested_order_qty double precision not null default 0,
  order_unit text not null default 'kom',
  for_date date not null,
  order_status text not null check (order_status in ('pending', 'ordered')),
  note text,
  unique (count_id, article_id)
);

create table if not exists book_stock_imports (
  id text primary key,
  date date not null,
  source text not null,
  raw_ref text not null
);

-- ---------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------

create or replace function app_session_role() returns text
language sql stable security definer set search_path = public as $$
  select u.role
  from app_sessions s join app_users u on u.id = s.user_id
  where s.token = coalesce(current_setting('request.headers', true)::json ->> 'x-session-token', '')
    and s.expires_at > now()
$$;

create or replace function app_is_member() returns boolean
language sql stable as $$ select app_session_role() is not null $$;

create or replace function app_is_admin() returns boolean
language sql stable as $$ select coalesce(app_session_role() = 'admin', false) $$;

-- ---------------------------------------------------------------------------
-- Login / users (RPC). PIN hashes never leave the database.
-- ---------------------------------------------------------------------------

create or replace function app_login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  u app_users;
  t text;
begin
  select * into u from app_users where lower(name) = lower(trim(p_name));
  if u.id is null or u.pin_hash <> crypt(p_pin, u.pin_hash) then
    perform pg_sleep(0.5); -- slow down guessing
    return null;
  end if;
  delete from app_sessions where expires_at < now();
  t := encode(gen_random_bytes(32), 'hex');
  insert into app_sessions (token, user_id, expires_at) values (t, u.id, now() + interval '90 days');
  return json_build_object('token', t, 'user', json_build_object('id', u.id, 'name', u.name, 'role', u.role));
end $$;

create or replace function app_me(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', u.id, 'name', u.name, 'role', u.role)
  from app_sessions s join app_users u on u.id = s.user_id
  where s.token = p_token and s.expires_at > now()
$$;

create or replace function app_logout(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from app_sessions where token = p_token
$$;

create or replace function app_list_users()
returns table (id text, name text, role text) language plpgsql stable security definer set search_path = public as $$
begin
  if not app_is_admin() then raise exception 'not allowed'; end if;
  return query select u.id, u.name, u.role from app_users u order by lower(u.name);
end $$;

create or replace function app_save_user(p_id text, p_name text, p_role text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_is_admin() then raise exception 'not allowed'; end if;
  if p_id is null then
    insert into app_users (name, role, pin_hash)
    values (trim(p_name), p_role, crypt(p_pin, gen_salt('bf')));
  else
    update app_users set
      name = coalesce(nullif(trim(p_name), ''), name),
      role = coalesce(p_role, role),
      pin_hash = case when coalesce(p_pin, '') = '' then pin_hash else crypt(p_pin, gen_salt('bf')) end
    where id = p_id;
  end if;
end $$;

create or replace function app_delete_user(p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app_is_admin() then raise exception 'not allowed'; end if;
  if (select count(*) from app_users where role = 'admin' and id <> p_id) = 0 then
    raise exception 'Mora ostati bar jedan admin.';
  end if;
  delete from app_users where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table app_users enable row level security;      -- no policies: only via RPC
alter table app_sessions enable row level security;   -- no policies: only via RPC
alter table categories enable row level security;
alter table suppliers enable row level security;
alter table articles enable row level security;
alter table counts enable row level security;
alter table count_lines enable row level security;
alter table order_lines enable row level security;
alter table book_stock_imports enable row level security;

do $$
declare t text;
begin
  -- Everyone logged in reads; only admin changes the master data.
  foreach t in array array['categories', 'suppliers', 'articles', 'book_stock_imports'] loop
    execute format('drop policy if exists member_read on %I', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy member_read on %I for select using (app_is_member())', t);
    execute format('create policy admin_write on %I for all using (app_is_admin()) with check (app_is_admin())', t);
  end loop;
  -- Workers create and fill counts / order lists; only admin deletes.
  foreach t in array array['counts', 'count_lines', 'order_lines'] loop
    execute format('drop policy if exists member_read on %I', t);
    execute format('drop policy if exists member_insert on %I', t);
    execute format('drop policy if exists member_update on %I', t);
    execute format('drop policy if exists admin_delete on %I', t);
    execute format('create policy member_read on %I for select using (app_is_member())', t);
    execute format('create policy member_insert on %I for insert with check (app_is_member())', t);
    execute format('create policy member_update on %I for update using (app_is_member()) with check (app_is_member())', t);
    execute format('create policy admin_delete on %I for delete using (app_is_admin())', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on categories, suppliers, articles, counts, count_lines, order_lines, book_stock_imports to anon, authenticated;
revoke all on app_users, app_sessions from anon, authenticated;
grant execute on function app_login(text, text), app_me(text), app_logout(text),
  app_list_users(), app_save_user(text, text, text, text), app_delete_user(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- First admin account. Change the PIN in the app right after the first login.
-- ---------------------------------------------------------------------------

insert into app_users (name, role, pin_hash)
select 'Admin', 'admin', extensions.crypt('admin', extensions.gen_salt('bf'))
where not exists (select 1 from app_users where role = 'admin');

notify pgrst, 'reload schema';
