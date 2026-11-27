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

## Obaveštenja (push „Popis završen“)

Kad radnik završi popis, aplikacija poziva Edge Function
[`notify-count-finished`](supabase/functions/notify-count-finished/index.ts), koja šalje
obaveštenje na svaki admin telefon gde su obaveštenja uključena (Pregled → 🔔 Uključi).
Na iPhone-u radi samo iz aplikacije dodate na početni ekran (iOS 16.4+).

Jednom, posle `supabase login` i `supabase link --project-ref <projekat>`:

1. SQL Editor → pokreni [`supabase/migrations/012_push.sql`](supabase/migrations/012_push.sql)
2. `supabase secrets set --env-file supabase/.env.push.local` — VAPID ključevi
   (fajl ne ide u git; javni ključ je i u [`src/lib/push.ts`](src/lib/push.ts), moraju se poklapati)
3. `supabase functions deploy notify-count-finished --no-verify-jwt`

## Unos fakture

Radnik na početnom ekranu bira „Unesi fakturu“, bira dobavljača, pretragom nalazi
artikle i upisuje koliko je stiglo, pa sve proverava i potvrđuje. Posle potvrde
stiže obaveštenje „📦 Faktura unesena“ (ista Edge Function kao za popis), a fakture
se vide u Admin → Fakture.

Jednom:

1. SQL Editor → pokreni [`supabase/migrations/014_deliveries.sql`](supabase/migrations/014_deliveries.sql),
   pa [`015_delivery_returns.sql`](supabase/migrations/015_delivery_returns.sql) (povrat robe),
   pa [`016_not_on_sef.sql`](supabase/migrations/016_not_on_sef.sql) (fakture van SEF-a se pamte po lager listi),
   pa [`017_arrivals_requests.sql`](supabase/migrations/017_arrivals_requests.sql) (naručeno vs stiglo, novi artikli od radnika)
2. `supabase functions deploy notify-count-finished --no-verify-jwt` (nova verzija zna i za fakture)

## Testovi

`npm test` — proverava proračune (nabavka, poređenje, fakture van SEF-a, naručeno vs stiglo,
radni dan do 07:00, popis bez interneta, izvoz u Excel).

## Netlify

Podešavanja builda su u [`netlify.toml`](netlify.toml). U Netlify-u treba dodati
**Site configuration → Environment variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Svaki push na `main` automatski pravi novi deploy.
