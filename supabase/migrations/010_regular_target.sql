-- 010: "dopuni do poželjnog" for regular days.
--   regular_target  desired stock in the counting unit; the order is
--                   (regular_target − counted) in whole packs. null = the old
--                   fixed rule (below minimum → order_qty).
-- Fruit (Voće i povrće, in kg) switches to it: the old minimum becomes the
-- desired amount, e.g. Limun 15 kg: has 10 → order 5 kg.
-- Safe to re-run.

alter table articles add column if not exists regular_target double precision;

update articles
  set regular_target = minimum, minimum = 0, order_unit = 'kg', pack_size = 1
  where category_id = 'cat-voce' and kind = 'weight' and unit = 'kg'
    and regular_target is null and minimum > 0;

notify pgrst, 'reload schema';
