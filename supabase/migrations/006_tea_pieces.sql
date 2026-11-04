-- 006: tea is counted in pieces (kom) — just the total plus "šta fali".
-- "Pitaj šta fali" articles have no ordering rules any more, so their old
-- minimum / weekend target are cleared to avoid confusion. Safe to re-run.

update articles set unit = 'kom' where lower(name) in ('caj', 'čaj') and unit = 'kesica';
update articles set minimum = 0, weekend_target = null where ask_note;

-- Oats: weighed in kg in total (e.g. 3 full 1 kg bags + half-open = 3.5),
-- ordered by the bag. Minimum / order quantity are set in the admin panel.
update articles set kind = 'weight', unit = 'kg', order_unit = 'kesa', pack_size = 1
  where lower(name) = 'ovsene pahuljice' and kind = 'yes_no';
