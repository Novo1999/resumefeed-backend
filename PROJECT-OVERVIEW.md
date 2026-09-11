# Resume Feed — Project Overview

> Shared document. An identical copy lives in `resumefeed-frontend/` and `resumefeed-backend/`.
> Last updated: 2026-09-11.

## What we're building

A community site where people upload their resume into a public feed, and others
react, rate, and leave written reviews. The value is the community: constructive
criticism from real people in your field, instead of a paid resume review or a
black-box ATS score.

The product needs a professional landing page with a marketing pitch that sells
that community angle — people helping each other get hired through honest critique.

## Repos at a glance

| | `resumefeed-frontend` | `resumefeed-backend` |
|---|---|---|
| Stack | Next.js 16.3.4, React 19.2.8, TS 5, Tailwind v4 | Express 4, TypeORM 0.3, Postgres (`pg`) |
| State / data | Redux Toolkit + RTK Query | TypeORM DataSource |
| UI | shadcn (`base-nova`, neutral, RSC on) | — |
| Auth | Supabase JS (browser, PKCE) | Supabase JS (service role) |
| Storage | Supabase Storage (`resumes` bucket) | Supabase Storage (service role) |
| Dev | `npm run dev` → :3000 | `npm run dev` (tsx watch) → :4000 |
| Git | branch `master`, 3 commits | branch `main`, 2 commits |

Both are scaffolding. **No product feature is built in either repo yet.**

## Frontend state

| Piece | Status |
|---|---|
| Next.js + TS + Tailwind v4 config | Done |
| Redux store, typed hooks, `Providers` in root layout | Done |
| RTK Query `baseApi` pointed at `${NEXT_PUBLIC_API_URL}/api` | Done |
| Dev-only RTK Query console logger | Done (uncommitted) |
| Supabase browser client — PKCE, persisted session, singleton | Written, **zero call sites** |
| 14 shadcn components vendored | Installed, **zero used** |
| Routes | Only `/`, still create-next-app boilerplate |
| Landing page, auth pages, feed, upload | Not started |

Key files:
- `store/api/baseApi.ts` — RTK Query root; inject feature endpoints here
- `store/api/loggingBaseQuery.ts` — wraps the base query, console-groups every request
- `lib/supabase/client.ts` — browser client singleton
- `lib/env.ts` — public runtime config
- `app/layout.tsx` — metadata + `Providers`

## Backend state

| Piece | Status |
|---|---|
| Express app factory, CORS (credentials on), JSON body parsing | Done |
| `GET /health` | Done |
| TypeORM DataSource against Supabase Postgres | Configured, connects lazily |
| Server Supabase client (service role key) | Written, **zero call sites** |
| Entities | **None** — `src/entities/` holds only `.gitkeep` |
| Routes under `/api` | **None mounted** |
| Auth middleware | Not started |

Key files:
- `src/app.ts` — middleware + route mounting point
- `src/index.ts` — boots the DataSource, then listens; warns instead of crashing if the DB is unconfigured
- `src/config/data-source.ts` — entity/migration globs
- `src/config/supabase.ts` — service-role client
- `src/config/env.ts` — server env config

## Seams between the two — known gaps

These are the specific places the two halves don't meet yet.

1. **The `/api` prefix has no counterpart.** The frontend calls
   `${NEXT_PUBLIC_API_URL}/api/...`, but `src/app.ts` only registers `/health` and
   leaves the `app.use('/api', router)` line as a comment. The first backend route
   must be mounted under `/api` or the frontend base URL has to change.

2. **No token crosses the wire.** `prepareHeaders` is commented out in
   `store/api/baseApi.ts`, so every request reaches Express anonymous. The backend
   has no middleware to verify a Supabase JWT either. Both sides need doing together:
   attach the Supabase access token as a bearer header, and verify it server-side
   (the service-role client can do this via `supabase.auth.getUser(token)`).

3. **Sessions are browser-only.** The frontend persists to `localStorage` and
   `@supabase/ssr` is not installed, so no server component, route handler, or
   middleware can read the session. Every gated page would have to be a client
   component that flashes before redirecting. If server-side route protection or
   SSR'd feed data is wanted, add `@supabase/ssr` and a `middleware.ts` **before**
   building pages — retrofitting touches every protected route.

4. **No domain model exists.** No entities, no migrations, no shared types. User,
   Resume, Review, Rating, and Reaction all still need defining — and nothing
   currently shares those shapes between the repos.

## Settled decisions

- **Storage: Supabase Storage.** Decided 2026-09-11, replacing the earlier
  UploadThing note. Supabase is already the auth provider *and* the Postgres host,
  so this is one less vendor and one less key, and RLS can gate a resume file by the
  same user ID that owns its row. The bucket name lives in
  `NEXT_PUBLIC_SUPABASE_RESUME_BUCKET` (frontend) and `SUPABASE_RESUME_BUCKET`
  (backend) — both default to `resumes` and must match.

  Deferred to the upload step (build order 5), not needed for auth:
  - Create the `resumes` bucket in the Supabase dashboard as **private**, not public.
  - RLS on `storage.objects`: a user may write only under a `{user_id}/` path
    prefix, so ownership is enforced by the path itself.
  - Serve files by signed URL rather than making the bucket public — the Express
    API is the natural issuer, since it already has to authorize the request.

## Open decisions

- **`DB_SYNCHRONIZE` defaults to `true`.** Fine for moving fast now; it will drop
  columns on you once there's real data. Plan to flip it off and generate a first
  migration before anything ships.

- **Where does moderation live?** Public resumes are PII (names, emails, phone
  numbers, employers). Worth deciding early whether uploads are public by default,
  whether reviewers are anonymous, and how a resume gets taken down.

## Suggested build order

1. **Domain model** — entities + first migration, so both repos agree on shapes.
2. **Auth end to end** — `/login`, `/signup`, Supabase callback handling,
   `prepareHeaders` on the frontend, JWT-verifying middleware on the backend,
   session-aware header UI.
3. **Landing page** — the marketing pitch; first thing anyone sees.
4. **Feed** — list resumes, `GET /api/resumes`.
5. **Upload** — file storage + resume record.
6. **Ratings and reviews** — the actual community loop.

## Running it locally

```bash
# backend — terminal 1
cd resumefeed-backend
cp .env.example .env     # fill DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run dev              # :4000

# frontend — terminal 2
cd resumefeed-frontend
cp .env.local.example .env.local   # fill the NEXT_PUBLIC_SUPABASE_* vars
npm run dev                        # :3000
```

The backend logs a warning rather than crashing when `DATABASE_URL` is unset, so
the API will boot and serve `/health` before Postgres is wired up.
