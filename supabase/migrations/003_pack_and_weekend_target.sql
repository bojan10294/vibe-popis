-- 003: pack size + weekend target.
--   pack_size       how much one order unit holds, in the counting unit
--                   (Rosa: 1 paket = 24 kom; alcohol: 1 flaša = 0.7 l)
--   weekend_target  how much to have after the Thursday order, in the counting
--                   unit; the app orders enough packs to reach it.
-- Replaces minimum_weekend / order_qty_weekend, which the app no longer uses
-- (columns are kept so older app versions keep working). Safe to re-run.

alter table articles add column if not exists pack_size double precision not null default 1;
alter table articles add column if not exists weekend_target double precision;

-- Carry over what was entered as "Ispod – vikend" as the starting weekend target.
update articles set weekend_target = minimum_weekend
  where weekend_target is null and minimum_weekend is not null;

-- Alcohol, syrups...: one order unit is one bottle of the (first) size.
update articles set pack_size = (bottle_sizes -> 0 ->> 'size_l')::double precision
  where kind = 'bottle' and pack_size = 1 and jsonb_array_length(bottle_sizes) > 0;

notify pgrst, 'reload schema';
