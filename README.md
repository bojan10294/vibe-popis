# Popis

Aplikacija za popis robe u kafiću i listu nabavke. React + Vite + Tailwind,
podaci u Supabase-u, hosting na Netlify-u, radi kao PWA (dodaje se na početni ekran).

## Lokalno pokretanje

1. `npm install`
2. Napravi `.env.local` (ne ide u git):
   ```
   VITE_SUPABASE_URL=https://<projekat>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
3. `npm run dev` → http://localhost:5174

## Baza (Supabase)

Ceo šema, zaštita (RLS) i prijava preko PIN-a su u [`supabase/schema.sql`](supabase/schema.sql).
Na novom projektu: SQL Editor → nalepi fajl → Run. Pravi se nalog `Admin` / PIN `admin`
— promeniti PIN odmah posle prve prijave. Početni spisak artikala se upisuje sam pri
prvoj prijavi admina (samo ako je baza prazna).

## Netlify

Podešavanja builda su u [`netlify.toml`](netlify.toml). U Netlify-u treba dodati
**Site configuration → Environment variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Svaki push na `main` automatski pravi novi deploy.
