-- 007: articles that are counted only once a week (glasses, spoons...).
--   count_weekday  null = every count; 0..6 = only on that day (0 = Sunday,
--                  1 = Monday ... 6 = Saturday, like JavaScript getDay()).
-- Safe to re-run.

alter table articles add column if not exists count_weekday smallint
  check (count_weekday between 0 and 6);

notify pgrst, 'reload schema';
