-- 004: "Šta fali" articles — instead of a number the worker writes what needs
-- ordering (e.g. tea: "zeleni, kamilica"); the text goes on the order list.
-- Safe to re-run.

alter table articles drop constraint if exists articles_kind_check;
alter table articles add constraint articles_kind_check
  check (kind in ('count', 'weight', 'bottle', 'yes_no', 'espresso', 'text'));

alter table order_lines add column if not exists note text;

-- Tea is counted this way from now on.
update articles set kind = 'text' where lower(name) in ('caj', 'čaj');

notify pgrst, 'reload schema';
