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

|              | `resumefeed-frontend`                           | `resumefeed-backend`                    |
| ------------ | ----------------------------------------------- | --------------------------------------- |
| Stack        | Next.js 16.3.4, React 19.2.8, TS 5, Tailwind v4 | Express 4, TypeORM 0.3, Postgres (`pg`) |
| State / data | Redux Toolkit + RTK Query                       | TypeORM DataSource                      |
| UI           | shadcn (`base-nova`, neutral, RSC on)           | —                                       |
| Auth         | Supabase JS (browser, PKCE)                     | Supabase JS (service role)              |
| Storage      | Supabase Storage (`resumes` bucket)             | Supabase Storage (service role)         |
| Dev          | `npm run dev` → :3000                           | `npm run dev` (tsx watch) → :4000       |
| Git          | branch `master`, 3 commits                      | branch `main`, 2 commits                |

Auth and the account page are built. **No resume feature exists in either repo yet.**

## Frontend state

| Piece                                                                      | Status                         |
| -------------------------------------------------------------------------- | ------------------------------ |
| Next.js + TS + Tailwind v4 config                                          | Done                           |
| Redux store, typed hooks, `Providers` in root layout                       | Done                           |
| RTK Query `baseApi` at `${NEXT_PUBLIC_API_URL}/api`, bearer token attached | Done                           |
| Dev-only RTK Query console logger                                          | Done                           |
| Supabase clients — browser, server (RSC), proxy                            | Done, cookie-based sessions    |
| Auth pages — `/login`, `/signup`, `/auth/callback`, server actions         | Done                           |
| Route gating + session refresh in `proxy.ts`                               | Done — `/account`, `/feed`     |
| Session-aware header with avatar + user menu                               | Done                           |
| Account page — avatar upload, name edit, read-only email                   | Done                           |
| Landing page (`/`)                                                         | create-next-app boilerplate    |
| Feed (`/feed`), resume upload                                              | Empty state only / not started |

Key files:

- `store/api/baseApi.ts` — RTK Query root; inject feature endpoints here
- `store/api/profileApi.ts` — `GET`/`PATCH /api/me`
- `lib/supabase/{client,server,proxy}.ts` — one client per execution context
- `lib/profile/user.ts` — narrows a Supabase user to what the UI renders
- `lib/storage/avatars.ts` — browser-side avatar upload, validation, pruning
- `lib/env.ts` — public runtime config
- `app/layout.tsx` — metadata, `Providers`, `SiteHeader`, `Toaster`

## Backend state

| Piece                                                         | Status                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Express app factory, CORS (credentials on), JSON body parsing | Done                                                       |
| `GET /health`                                                 | Done                                                       |
| Auth middleware — `requireAuth`, `optionalAuth`               | Done, verifies Supabase JWT                                |
| `GET /api/me`, `PATCH /api/me`                                | Done — profile read/update                                 |
| Storage buckets + RLS policies                                | Done — `supabase/storage-setup.sql`                        |
| TypeORM DataSource against Supabase Postgres                  | Configured, connects lazily                                |
| Entities + first migration                                    | Done — Resume, rating, comment, and reaction model         |
| Resume create, feed, and PDF-read routes                      | Done — authenticated feed uses short-lived signed PDF URLs |
| Review, rating, reaction routes                               | Not started                                                |

Key files:

- `src/app.ts` — middleware + route mounting point
- `src/routes/me.ts` — profile read/update; email is rejected, not ignored
- `src/middleware/auth.ts` — token verification
- `src/index.ts` — boots the DataSource, then listens; warns instead of crashing if the DB is unconfigured
- `src/config/data-source.ts` — entity/migration globs
- `src/config/supabase.ts` — service-role client
- `src/config/env.ts` — server env config
- `supabase/storage-setup.sql` — buckets and storage RLS, idempotent

## Seams between the two — known gaps

These are the specific places the two halves don't meet yet.

The `/api` prefix, the bearer token and server-readable sessions are all closed —
`GET`/`PATCH /api/me` exercises the whole chain end to end. What is left:

1. **Feed API shapes are not shared yet.** The database domain model is now in the
   backend, but feed responses still need a shared contract (or generated client)
   before the frontend consumes them. `MeResponse` is hand-mirrored in
   `src/routes/me.ts` and `store/api/profileApi.ts`; they drift silently.

2. **Profile changes are invisible to client components.** `PATCH /api/me` updates
   the auth user with the service-role key, so the browser's cached JWT still holds
   the old `user_metadata` until it refreshes. Server components are fine — they
   call `getUser()`, which hits the auth server — which is why the account form ends
   in `router.refresh()`. Anything reading metadata off the client session directly
   would show stale values.

3. **The community interaction loop is not exposed yet.** Feed posts now load and
   render their first PDF page from time-limited URLs, but rating, comment, and
   reaction endpoints still need to be built.

## Settled decisions

- **Storage: Supabase Storage.** Decided 2026-09-11, replacing the earlier
  UploadThing note. Supabase is already the auth provider _and_ the Postgres host,
  so this is one less vendor and one less key, and RLS can gate a resume file by the
  same user ID that owns its row.

  **Buckets created 2026-09-11** by `resumefeed-backend/supabase/storage-setup.sql`
  — run that whole file in the Supabase SQL editor. It is idempotent.
  - `avatars` — **public**, 2 MiB, PNG/JPEG/WebP. Profile pictures render on every
    feed card, so a signed URL per render would be waste, and a picture is not PII
    the way a resume is.
  - `resumes` — **private**, 5 MiB, PDF only. Reads go through a signed URL minted
    by the Express API, which is where "may this person see this resume?" is decided.
  - Ownership in both buckets is the first path segment, `{user_id}/`, which the RLS
    policies compare against `auth.uid()`. Uploads must keep writing that shape —
    it is the only thing enforcing ownership.
  - Bucket names live in `NEXT_PUBLIC_SUPABASE_{AVATAR,RESUME}_BUCKET` (frontend)
    and `SUPABASE_{AVATAR,RESUME}_BUCKET` (backend). They must match.

- **Profiles live in Supabase `user_metadata`, not a table.** `full_name` and
  `avatar_url` are enough for now, and keeping them on the auth user means the
  header and account page read them straight off the session with no join. Revisit
  when a profile needs anything a reviewer would search on.

- **Resume feed data model.** A `resumes` row is a public feed post and belongs to
  one Supabase Auth user through `owner_id`. It stores immutable PDF metadata and
  the relative `storage_path` in the existing private `resumes` bucket — never a
  permanent object URL. Every path must remain `{owner_id}/{filename}.pdf` to meet
  the storage RLS policy.
  - `resume_ratings` holds a 1–5 score and has one row per `(resume_id, author_id)`;
    changing a score updates that same row.
  - `resume_comments` holds written feedback (up to 2,000 characters).
  - `resume_reactions` holds `helpful`, `insightful`, or `encouraging`; a person may
    use each kind once per resume.
  - `resumes.average_rating`, `rating_count`, `comment_count`, and `reaction_count`
    are feed-card aggregates. Database triggers maintain them on every child-row
    insert, update, and delete; an unrated resume has `average_rating = null`.

  Auth users are intentionally not duplicated or foreign-keyed in this schema;
  Supabase Auth remains the profile source of truth. API responses will hydrate an
  owner/commenter name and avatar from there.

## Open decisions

- **Schema changes now use migrations.** `DB_MIGRATIONS_RUN=true` applies pending
  TypeORM migrations at backend startup; `DB_SYNCHRONIZE` now defaults to `false`.
  Set synchronization to true only for a disposable local database.

- **Where does moderation live?** Public resumes are PII (names, emails, phone
  numbers, employers). Worth deciding early whether uploads are public by default,
  whether reviewers are anonymous, and how a resume gets taken down.

## Suggested build order

- ~~**Auth end to end**~~ — done: pages, server actions, `proxy.ts` gating, bearer
  token, `requireAuth`, session-aware header.
- ~~**Profiles and storage**~~ — done: both buckets with RLS, avatar upload,
  `PATCH /api/me`.

1. ~~**Domain model**~~ — Resume, rating, comment, and reaction entities plus the
   first migration are complete.
2. **Landing page** — the marketing pitch; first thing anyone sees.
3. ~~**Upload**~~ — the frontend uploads a PDF into `resumes/{user_id}/`; the API
   verifies its ownership and MIME type before creating the resume record.
4. ~~**Feed**~~ — `GET /api/resumes` lists newest posts with ten-minute signed
   URLs; the viewer renders page one and opens the full PDF on demand.
5. **Ratings, comments, and reactions** — the actual community loop.

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

Once per Supabase project, paste `resumefeed-backend/supabase/storage-setup.sql`
into the dashboard's SQL editor and run it. Until that happens the account page
loads but an avatar upload fails with `Bucket not found`.
