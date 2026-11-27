-- 017: naručeno vs stiglo, and new articles requested by workers.
--   deliveries.order_check  snapshot taken when the faktura is confirmed: the
--                           ordering list against what arrived (for the push).
--   article_requests        "nema ga na spisku": a worker asks for a new
--                           article (from a faktura); the admin approves it
--                           (creates the article / picks an existing one) or
--                           rejects it. notified_at = push went out.
-- Run after 014–016. Safe to re-run.

alter table deliveries add column if not exists order_check jsonb;

create table if not exists article_requests (
  id text primary key,
  created_at timestamptz not null default now(),
  user_id text not null,
  user_name text not null,
  delivery_id text references deliveries (id) on delete set null,
  supplier_id text references suppliers (id) on delete set null,
  name text not null,
  unit text not null,
  qty double precision,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  article_id text,
  decided_at timestamptz,
  notified_at timestamptz
);
create index if not exists article_requests_status_idx on article_requests (status);

alter table article_requests enable row level security;
drop policy if exists member_read on article_requests;
drop policy if exists member_insert on article_requests;
drop policy if exists member_delete_pending on article_requests;
drop policy if exists admin_update on article_requests;
drop policy if exists admin_delete on article_requests;
create policy member_read on article_requests for select using (app_is_member());
create policy member_insert on article_requests for insert with check (app_is_member() and status = 'pending');
-- A worker can take back a request until the admin decided.
create policy member_delete_pending on article_requests for delete using (app_is_member() and status = 'pending');
create policy admin_update on article_requests for update using (app_is_admin()) with check (app_is_admin());
grant select, insert, update, delete on article_requests to anon, authenticated;

notify pgrst, 'reload schema';
