-- 015: povrat robe on a faktura.
--   delivery_lines.direction  'in' = stiglo, 'return' = vraćamo dobavljaču.
--   The same article can now be on one faktura twice: once arrived, once returned.
-- Run after 014. Safe to re-run.

alter table delivery_lines add column if not exists direction text not null default 'in'
  check (direction in ('in', 'return'));

alter table delivery_lines drop constraint if exists delivery_lines_delivery_id_article_id_key;
alter table delivery_lines drop constraint if exists delivery_lines_delivery_article_direction_key;
alter table delivery_lines add constraint delivery_lines_delivery_article_direction_key
  unique (delivery_id, article_id, direction);

notify pgrst, 'reload schema';
