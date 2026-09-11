# Resume Feed — Backend (boilerplate)

Express + TypeScript + TypeORM + PostgreSQL (Supabase).

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL (and Supabase keys when needed)
npm run dev            # http://localhost:4000  →  GET /health
```

## Structure

```
src/
  config/
    env.ts           # env vars
    data-source.ts   # TypeORM connection (loads src/entities/*)
    supabase.ts      # server-side Supabase client
  entities/          # add your TypeORM entities here
  controllers/       # HTTP request/response handling and status-code mapping
  services/          # validation, database, storage, and other business logic
  routes/            # URL + middleware bindings only
  types/             # domain and API TypeScript types
  app.ts             # express app + middleware (mount routes here)
  index.ts           # boot: connect DB, start server
```

## Backend layer convention

Keep each API feature split by responsibility:

- **`routes/`** declares paths and middleware only. Do not put validation,
  database calls, or response logic here.
- **`controllers/`** translate Express requests into service calls and map results
  or failures to HTTP status codes and JSON responses.
- **`services/`** contain feature business logic, TypeORM queries, Supabase
  storage/Auth calls, validation, and domain errors. They must not import Express.
- **`types/`** holds all reusable domain and API types. Do not declare exported
  feature types in routes, controllers, or services.
- **`entities/`** define persistence mappings only.

New backend work must follow this convention.

## Scripts

| Script              | Description                 |
| ------------------- | --------------------------- |
| `npm run dev`       | Dev server with watch (tsx) |
| `npm run build`     | Compile to `dist/`          |
| `npm start`         | Run compiled server         |
| `npm run typecheck` | Type-check only             |

Pending migrations run at startup by default (`DB_MIGRATIONS_RUN=true`). Keep
`DB_SYNCHRONIZE=false`; only enable synchronization for a disposable local database.
