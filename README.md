# ResumeFeed backend

The ResumeFeed backend is an Express API for the ResumeFeed community app. It verifies Supabase access tokens, applies feed and moderation rules, stores feed data in Supabase Postgres through TypeORM, and issues temporary URLs for private resume PDFs.

The companion [frontend](../resumefeed-frontend/README.md) is a Next.js app that authenticates users and calls this API.

## Stack

- Express 4 and TypeScript
- TypeORM 0.3 and PostgreSQL (Supabase Postgres)
- Supabase Auth for server-side access-token verification
- Supabase Storage for private resume PDFs and public avatars
- TypeORM migrations for schema changes

## Architecture

```text
Next.js frontend
  |  Bearer token + JSON requests
  v
Express API
  |-- requireAuth -------- verifies each Supabase JWT
  |-- routes ------------ URL and middleware declarations only
  |-- controllers ------- HTTP input/output and status mapping
  |-- services ---------- validation, authorization, business rules, data access
  |-- TypeORM entities -- PostgreSQL persistence mappings
  |       |
  |       +------------- Supabase Postgres (resumes, comments, reactions, notifications)
  |
  +-- Supabase client --- Auth profile reads/updates and Storage signed URLs
                            |
                            +-- private resumes bucket
                            +-- public avatars bucket
```

The API uses a service-role Supabase client only on the server. That key bypasses Supabase RLS, so every protected endpoint must retain `requireAuth` and enforce ownership and authorization in its service layer.

### Layer boundaries

```text
src/
  app.ts                 Express middleware and router mounting
  index.ts               Database initialization and HTTP server bootstrap
  config/                Environment, TypeORM DataSource, Supabase client
  middleware/            Authentication, database guard, HTTP logging
  routes/                Paths and middleware chains; no business logic
  controllers/           Request parsing, response shaping, error-to-status mapping
  services/              Validation, permissions, queries, storage, domain rules
  entities/              TypeORM mappings for persisted records
  migrations/            Ordered, versioned schema changes
  types/                 Shared backend domain/API types
  scripts/               Operational scripts, including resume seeding
supabase/storage-setup.sql
                          Bucket creation and storage RLS policies
```

### Data model

- `resumes` is a public feed post. It stores PDF metadata and a relative storage path, never a permanent document URL.
- Each resume can have one rating and one reaction per user, plus comments. Database triggers maintain rating, reaction, and comment aggregates for feed cards.
- Comments support roots and one reply level. Deleting a comment with replies produces a tombstone so the replies remain; otherwise the row is deleted.
- Comment reactions follow the same one-per-user behavior as resume reactions.
- `notifications` stores recipient-scoped events for comments, replies, reactions, and ratings, including an event-time comment preview.
- Supabase Auth remains the profile source of truth; user IDs are stored without copying Auth users into application tables.

## Run locally

### Prerequisites

- Node.js 20 or newer and npm
- A Supabase project with Auth enabled
- Access to its Postgres connection string, Project URL, and service-role key

### 1. Configure Supabase storage

In Supabase Dashboard, open **SQL Editor**, paste the contents of [`supabase/storage-setup.sql`](./supabase/storage-setup.sql), and run it once. The script is idempotent and creates:

| Bucket | Visibility | Allowed content |
| --- | --- | --- |
| `avatars` | Public | PNG, JPEG, WebP; maximum 2 MiB |
| `resumes` | Private | PDF; maximum 5 MiB |

The policies require every upload path to begin with the authenticated user's UUID: `<user-id>/<filename>`. The frontend follows this convention.

### 2. Create the environment file

From this directory:

```powershell
Copy-Item .env.example .env
```

Set the required values in `.env`:

```dotenv
PORT=4000
CORS_ORIGIN=http://localhost:3000

DATABASE_URL=postgresql://...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
```

Keep `DB_SYNCHRONIZE=false`. Migrations run at startup by default through `DB_MIGRATIONS_RUN=true`; setting synchronization to true is appropriate only for a disposable database. Supabase typically requires TLS, so `DB_SSL=true` is the default. Set it to `false` only when using a local Postgres instance without TLS.

### 3. Install and start

```powershell
npm install
npm run dev
```

The development command watches `src`, recompiles TypeScript, and starts the API at <http://localhost:4000>. Check it with:

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/health/db
```

`/health` only confirms that Express is running. `/health/db` verifies database connectivity. The server intentionally remains available for `/health` even when `DATABASE_URL` is not configured, but API routes requiring the database will not work until it is.

### 4. Start the frontend

Configure and start `resumefeed-frontend` in a separate terminal. Its `NEXT_PUBLIC_API_URL` must point to `http://localhost:4000`; its Supabase URL and anon key must refer to this same Supabase project. Follow the frontend README for its detailed setup and auth redirect configuration.

## API surface

All `/api/*` endpoints below require an `Authorization: Bearer <Supabase access token>` header. The frontend's RTK Query base client adds this automatically.

| Area | Endpoints |
| --- | --- |
| Health | `GET /health`, `GET /health/db` |
| Current profile | `GET /api/me`, `PATCH /api/me` |
| Public profiles | `GET /api/profiles/:userId` |
| Resumes | `POST/GET /api/resumes`, `GET /api/resumes/:resumeId`, `GET /api/resumes/:resumeId/document` |
| Resume feedback | `PUT /api/resumes/:resumeId/rating`, `PUT /api/resumes/:resumeId/reaction`, `GET /api/resumes/:resumeId/reactions` |
| Resume comments | `POST/GET /api/resumes/:resumeId/comments` |
| Comment actions | `GET /api/comments/:commentId/context`, `GET/POST /api/comments/:commentId/replies`, `PUT /api/comments/:commentId/reaction`, `PATCH/DELETE /api/comments/:commentId` |
| Notifications | `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/read-all`, `PATCH /api/notifications/:notificationId/read` |

Resume listing, reactions, comment threads, replies, and notifications use cursor pagination. The API returns a `nextCursor` when more results are available.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch TypeScript, compile to `dist`, and run the API. |
| `npm run build` | Compile `src` to `dist`. |
| `npm start` | Run the compiled API. |
| `npm run typecheck` | Type-check without writing build output. |
| `npm run seed:resumes` | Upload the configured seed PDFs and create feed rows. |
| `npm run format:check` | Check formatting with Prettier. |
| `npm run format` | Format source files with Prettier. |

## Optional: seed resume posts

The seed script uploads a curated PDF set and creates feed records. It needs an existing Supabase Auth user's UUID and a directory of seed PDFs:

```powershell
$env:RESUME_SEED_OWNER_ID = '<supabase-auth-user-uuid>'
$env:RESUME_SEED_DIRECTORY = 'C:\path\to\pdfs' # optional; defaults to E:\CV
npm run seed:resumes
```

Use `RESUME_SEED_BATCH` to create a separate labelled test batch. The script is safe to re-run for the same seed storage paths.

## Production configuration

- Set `CORS_ORIGIN` to the canonical HTTPS frontend origin; it must match the frontend's `NEXT_PUBLIC_SITE_URL` origin.
- Set `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` as private server secrets. Never expose the service-role key to the frontend or commit it.
- Use migrations (`DB_MIGRATIONS_RUN=true`) for schema changes rather than `DB_SYNCHRONIZE` in shared or production databases.
- Keep the `resumes` bucket private. The API grants document access with signed URLs after it has verified the caller's token and permissions.

## Related documentation

- [`PROJECT-OVERVIEW.md`](./PROJECT-OVERVIEW.md) contains product and design context.
- [`docs/adr`](./docs/adr) records decisions about comment threading, comment deletion, and durable notifications.
- The [frontend README](../resumefeed-frontend/README.md) documents browser configuration and the client architecture.
