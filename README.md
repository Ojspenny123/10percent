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

Set the three env vars on the host, run `npx prisma db push`, then `npm run build` and `npm start`. Seed against that same `DATABASE_URL` with `npm run seed`, or use `/admin`.

You need a TMDB v4 read token and a Postgres database. Nothing else is manual.
