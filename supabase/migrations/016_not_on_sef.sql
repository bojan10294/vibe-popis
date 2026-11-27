-- 016: fakture van SEF-a per Lager lista, and "poručeno" removed.
--   lager_not_on_sef   for the PDF of `date`: fakture the accountant didn't have
--                      yet. Poređenje and the keš/račun rule on the ordering
--                      list both add them to the accountant's Stanje.
--   order_lines.order_status  dropped: nothing in the app sets it.
-- Run after 014 and 015. Safe to re-run.

create table if not exists lager_not_on_sef (
  date date not null,
  delivery_id text not null references deliveries (id) on delete cascade,
  primary key (date, delivery_id)
);

alter table lager_not_on_sef enable row level security;
drop policy if exists member_read on lager_not_on_sef;
drop policy if exists admin_write on lager_not_on_sef;
create policy member_read on lager_not_on_sef for select using (app_is_member());
create policy admin_write on lager_not_on_sef for all using (app_is_admin()) with check (app_is_admin());
grant select, insert, update, delete on lager_not_on_sef to anon, authenticated;

alter table order_lines drop column if exists order_status;

notify pgrst, 'reload schema';
