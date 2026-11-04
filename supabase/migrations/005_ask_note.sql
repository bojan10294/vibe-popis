-- 005: "Pitaj šta fali" as an option on any article, instead of a separate
-- text-only kind (004). The worker enters the count as usual and, below it,
-- may write what is missing (e.g. tea flavours); the note goes on the order list.
-- Safe to re-run.

alter table articles add column if not exists ask_note boolean not null default false;

-- Articles switched to the text-only kind by 004 go back to counting pieces,
-- now with the note field.
update articles set kind = 'count', ask_note = true where kind = 'text';

notify pgrst, 'reload schema';
