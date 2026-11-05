-- 009: new suppliers (Kej, Manda, Fotobest, Oliveti) and more assignments.
-- Run after 008. Safe to re-run.

insert into suppliers (id, name, sort_order) values
  ('sup-kej', 'Kej', 16),
  ('sup-manda', 'Manda', 17),
  ('sup-fotobest', 'Fotobest', 18),
  ('sup-oliveti', 'Oliveti', 19)
on conflict (id) do nothing;

update articles set supplier_id = 'sup-bolero'
  where lower(name) in ('caj', 'čaj', 'ness', 'slatka pavlaka') or lower(name) like 'topla cokolada%' or lower(name) like 'topla čokolada%';

update articles set supplier_id = 'sup-lidl'
  where lower(name) in ('nutella', 'lesnik', 'lešnik', 'pistac', 'pistać', 'plazma');

update articles set supplier_id = 'sup-kej' where lower(name) = 'toping';

update articles set supplier_id = 'sup-manda'
  where lower(name) in ('ubrusi wc', 'ubrusi za wc', 'wc papir', 'tecni sapun', 'tečni sapun');

update articles set supplier_id = 'sup-secerici' where lower(name) in ('slamcice', 'slamčice');

update articles set supplier_id = 'sup-fotobest' where lower(name) = 'porukice';

update articles set supplier_id = 'sup-oliveti' where lower(name) = 'trake za kasu';

notify pgrst, 'reload schema';
