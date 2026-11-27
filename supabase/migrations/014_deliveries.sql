-- 014: unos fakture (what arrived from a supplier, entered by a worker).
--   deliveries       one per invoice / otpremnica; 'in_progress' while the worker
--                    adds items, 'confirmed' after the review screen.
--   delivery_lines   one per article: what the worker typed (qty + unit) and the
--                    same amount in the article's counting unit (base_qty).
--   deliveries.notified_at  set when the push went out, so it goes once.
-- Safe to re-run.

create table if not exists deliveries (
  id text primary key,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  user_id text not null,
  user_name text not null,
  supplier_id text references suppliers (id) on delete set null,
  supplier_name text,
  note text not null default '',
  status text not null check (status in ('in_progress', 'confirmed')),
  notified_at timestamptz
);
create index if not exists deliveries_created_idx on deliveries (created_at desc);

create table if not exists delivery_lines (
  id text primary key,
  delivery_id text not null references deliveries (id) on delete cascade,
  article_id text not null,
  article_name text not null,
  qty double precision not null,
  unit text not null,
  base_qty double precision not null,
  base_unit text not null,
  created_at timestamptz not null default now(),
  unique (delivery_id, article_id)
);

alter table deliveries enable row level security;
alter table delivery_lines enable row level security;

do $$
declare t text;
begin
  -- Workers create and fill deliveries; workers may remove a line they added
  -- by mistake; only admin deletes a whole delivery.
  foreach t in array array['deliveries', 'delivery_lines'] loop
    execute format('drop policy if exists member_read on %I', t);
    execute format('drop policy if exists member_insert on %I', t);
    execute format('drop policy if exists member_update on %I', t);
    execute format('drop policy if exists admin_delete on %I', t);
    execute format('drop policy if exists member_delete on %I', t);
    execute format('create policy member_read on %I for select using (app_is_member())', t);
    execute format('create policy member_insert on %I for insert with check (app_is_member())', t);
    execute format('create policy member_update on %I for update using (app_is_member()) with check (app_is_member())', t);
  end loop;
  create policy admin_delete on deliveries for delete using (app_is_admin());
  create policy member_delete on delivery_lines for delete using (app_is_member());
end $$;

grant select, insert, update, delete on deliveries, delivery_lines to anon, authenticated;

notify pgrst, 'reload schema';
