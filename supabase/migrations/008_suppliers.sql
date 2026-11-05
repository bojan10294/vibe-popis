-- 008: suppliers (dobavljači). Each article can have one supplier; the order
-- list is grouped by supplier. `phone` is for sending the list later.
-- Safe to re-run: existing suppliers and assignments are kept.

create table if not exists suppliers (
  id text primary key,
  name text not null,
  phone text,
  sort_order integer not null default 0
);

alter table articles add column if not exists supplier_id text references suppliers (id) on delete set null;
create index if not exists articles_supplier_idx on articles (supplier_id);

alter table suppliers enable row level security;
drop policy if exists member_read on suppliers;
drop policy if exists admin_write on suppliers;
create policy member_read on suppliers for select using (app_is_member());
create policy admin_write on suppliers for all using (app_is_admin()) with check (app_is_admin());
grant select, insert, update, delete on suppliers to anon, authenticated;

-- Starting list.
insert into suppliers (id, name, sort_order) values
  ('sup-bolero', 'Bolero', 1),
  ('sup-voce', 'Voće', 2),
  ('sup-silton', 'Šilton', 3),
  ('sup-lidl', 'Lidl', 4),
  ('sup-topglass', 'Top Glass', 5),
  ('sup-cure', 'Ćure', 6),
  ('sup-dukat', 'Dukat', 7),
  ('sup-julius', 'Julius', 8),
  ('sup-zdrava', 'Zdrava hrana', 9),
  ('sup-pansport', 'Pansport', 10),
  ('sup-weroli', 'Weroli', 11),
  ('sup-frikom', 'Frikom', 12),
  ('sup-secerici', 'Šećerići', 13),
  ('sup-kinezi', 'Kinezi', 14),
  ('sup-ostalo', 'Ostalo', 15)
on conflict (id) do nothing;

-- Assign articles that don't have a supplier yet. Specific rules first, then
-- whole categories, so e.g. Dragačevka goes to Ćure and not to Bolero.
update articles set supplier_id = 'sup-cure' where supplier_id is null and (lower(name) like 'dragacevka zlatna%' or lower(name) like 'dragačevka zlatna%');
update articles set supplier_id = 'sup-dukat' where supplier_id is null and (lower(name) like 'domaca kafa%' or lower(name) like 'domaća kafa%');
update articles set supplier_id = 'sup-julius' where supplier_id is null and (kind = 'espresso' or lower(name) like 'espres%');
update articles set supplier_id = 'sup-zdrava' where supplier_id is null and (lower(name) in ('boja', 'crna boja') or lower(name) like 'matcha%');
update articles set supplier_id = 'sup-pansport' where supplier_id is null and (lower(name) like 'whey%');
update articles set supplier_id = 'sup-weroli' where supplier_id is null and (lower(name) like 'krem %');
update articles set supplier_id = 'sup-frikom' where supplier_id is null and (lower(name) like 'sladoled%');
update articles set supplier_id = 'sup-secerici' where supplier_id is null and (lower(name) like 'secerici%' or lower(name) like 'šećerići%' or lower(name) like '%ratluk%' or lower(name) in ('male salvete', 'velike salvete', 'salvete'));
update articles set supplier_id = 'sup-kinezi' where supplier_id is null and (lower(name) like 'stipaljk%');
update articles set supplier_id = 'sup-ostalo' where supplier_id is null and (lower(name) like 'pena za koktel%');
update articles set supplier_id = 'sup-topglass' where supplier_id is null and (lower(name) like 'case%' or lower(name) like 'čaše%' or lower(name) like 'kasicice%' or lower(name) like 'kašičice%' or lower(name) like 'patroni%');
update articles set supplier_id = 'sup-silton' where supplier_id is null and (lower(name) = 'cokoladice' or lower(name) = 'čokoladice');
update articles set supplier_id = 'sup-bolero' where supplier_id is null and (lower(name) like 'ubrusi%' or lower(name) in ('mleko', 'bademovo mleko', 'ovseno mleko'));
update articles set supplier_id = 'sup-bolero' where supplier_id is null and (category_id in ('cat-flasice', 'cat-pivo-vino', 'cat-alkohol', 'cat-sirupi'));
update articles set supplier_id = 'sup-voce' where supplier_id is null and (category_id = 'cat-voce');
update articles set supplier_id = 'sup-lidl' where supplier_id is null and (category_id = 'cat-ovsene');

notify pgrst, 'reload schema';
