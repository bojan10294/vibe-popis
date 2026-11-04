-- 002: how much to order per article (regular day / Thursday-for-the-weekend)
-- and in which unit (kom, paket, gajba...). Run once in the SQL Editor.
-- Safe to re-run.

alter table articles add column if not exists order_qty double precision not null default 1;
alter table articles add column if not exists order_qty_weekend double precision;
alter table articles add column if not exists order_unit text not null default 'kom';

alter table order_lines add column if not exists order_unit text not null default 'kom';

-- Sensible starting units; the admin adjusts them per article afterwards.
-- Only touches rows still on the default, so re-running never overwrites edits.
update articles set order_unit = 'gajba'
  where order_unit = 'kom' and kind = 'count' and unit = 'kom'
    and category_id in ('cat-flasice', 'cat-pivo-vino');
update articles set order_unit = 'flaša' where order_unit = 'kom' and kind = 'bottle';
update articles set order_unit = 'bure' where order_unit = 'kom' and unit = 'bure';
update articles set order_unit = 'kg' where order_unit = 'kom' and kind = 'weight' and unit = 'kg';
update articles set order_unit = 'kesa' where order_unit = 'kom' and kind = 'espresso';
update articles set order_unit = 'paket' where order_unit = 'kom' and kind = 'count' and unit in ('kesica', 'l');

notify pgrst, 'reload schema';
