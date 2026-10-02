# Ten Percent

Hollywood talent-agency management game. Real actors and directors from a TMDB cache. Every film and series is fictional.

## Environment

Copy `.env.example` to `.env` and `.env.local` (Prisma reads `.env`; Next.js reads `.env.local`).

- `DATABASE_URL` — Postgres connection string
- `TMDB_READ_TOKEN` — TMDB v4 read access token, server-side only
- `ADMIN_SECRET` — protects `POST /api/admin/seed` and the status check

## Local database

```bash
docker compose up -d
npm install
npx prisma db push
```

## Seed

```bash
npm run seed
```

The script resumes if it stops. On a host that cannot run scripts, open `/admin`, enter `ADMIN_SECRET`, and run batches. `/data` shows the cached counts.

## Run

```bash
npm run dev
npm test
npm run simulate
```

## Deploy

Set `DATABASE_URL`, `TMDB_READ_TOKEN`, and `ADMIN_SECRET` on the host, run `npx prisma db push`, then `npm run build` and `npm start`. Seed against that same `DATABASE_URL` with `npm run seed`, or use `/admin`.

The Netlify build runs `scripts/provision-db.mjs` first. If `DATABASE_URL` is already set, that database is used. Otherwise the build provisions a temporary Postgres database, writes it to gitignored `.env.production` so the server can read it, and restores the actor and director catalog. The claim URL is printed in the build log. Unclaimed databases are deleted after 24 hours, and a later build that cannot reach the old one starts a fresh database, which clears save slots.
