-- 013: keš / račun on the ordering list.
--   order_lines.payment  'cash' or 'invoice' when the admin switched it by hand;
--                        null = automatic (keš when the article is in manjak
--                        against the accountant's book stock, otherwise račun).
-- Safe to re-run.

alter table order_lines add column if not exists payment text
  check (payment in ('cash', 'invoice'));

notify pgrst, 'reload schema';
