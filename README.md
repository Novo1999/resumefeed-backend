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
  app.ts             # express app + middleware (mount routes here)
  index.ts           # boot: connect DB, start server
```

## Scripts

| Script              | Description                 |
| ------------------- | --------------------------- |
| `npm run dev`       | Dev server with watch (tsx) |
| `npm run build`     | Compile to `dist/`          |
| `npm start`         | Run compiled server         |
| `npm run typecheck` | Type-check only             |

`DB_SYNCHRONIZE=true` auto-creates tables from your entities — handy for the
hackathon. Add entities under `src/entities/`, then build your routes/controllers.
