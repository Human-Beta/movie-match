# Database development

Movie Match uses Supabase Postgres for persistent data, Drizzle ORM for application queries, and Drizzle Kit for SQL migrations. The browser integration exposes only the Supabase Realtime methods needed to create and remove channels; it does not expose the full `SupabaseClient` or its Data API mutation methods.

For a table-by-table explanation of the product model, see the [database schema domain guide](domain/database-schema.md).

## Data-access boundary

Use the following split for all product features:

- Browser commands call a validated Next.js server boundary.
- Server code applies business rules and reads or writes Postgres through Drizzle.
- Supabase Realtime delivers approved database events back to browsers.

The restricted TypeScript export is a developer guardrail, not a security boundary. Migration `0000_secure_data_api_defaults.sql` also removes automatic Data API access for existing and future objects in `public`. A later migration that exposes a table for Realtime or browser reads must enable RLS, add the required `SELECT` policy, and explicitly grant only `SELECT` to the necessary `anon` or `authenticated` role. Product tables must not grant browser roles `INSERT`, `UPDATE`, or `DELETE`.

## Configure Supabase

1. Create or open the Supabase project.
2. Copy `.env.example` to `.env.local`.
3. In the Supabase dashboard, open **Connect** and copy the project URL, publishable key, and a PostgreSQL connection string into `.env.local`.

Use the direct connection string for migrations when the machine supports IPv6. If it does not, use the session pooler on port `5432`. For a serverless production runtime, use the transaction pooler on port `6543`; the application database client disables prepared statements so that connection is safe to use.

`DATABASE_URL` is server-only. Only the project URL and publishable key use the `NEXT_PUBLIC_` prefix because those values are intended for the browser. Never expose a database password or Supabase secret/service-role key through a `NEXT_PUBLIC_` variable.

## Run PostgreSQL locally

The repository includes `docker-compose.example.yml` for testing Drizzle migrations and server-side database code without connecting to a hosted project. Create local working files and start PostgreSQL:

```bash
cp docker-compose.example.yml docker-compose.yml
cp .env.example .env.local
```

Set `DATABASE_URL` in `.env.local` to:

```text
postgresql://postgres:postgres@127.0.0.1:54322/movie_match
```

Then run:

```bash
docker compose --env-file .env.local up -d postgres
pnpm db:migrate
```

The container exposes PostgreSQL only on localhost and creates local stand-ins for the Supabase Data API roles so the security migration can be tested. Stop it with `docker compose down`; add `--volumes` only when intentionally deleting the local database.

This is deliberately a database-only setup. It does not provide Supabase Realtime, Data API, Auth, or Studio. Use a hosted Supabase project for those services. If the project later needs the complete Supabase platform offline, use the official Supabase CLI local stack instead of maintaining all Supabase services by hand in this Compose file.

## Create and apply migrations

After changing `lib/db/schema.ts`, generate a migration and inspect the generated SQL before applying it:

```bash
pnpm db:generate
pnpm db:migrate
```

Drizzle Kit writes generated migration files to `drizzle/`. Commit schema changes and their generated migrations together. Keep Data API access opt-in: migrations that introduce product tables must enable RLS, and migrations that expose browser reads or Realtime events must grant only the access required by that feature.

Both migration commands load `DATABASE_URL` from `.env.local`. If it is missing or invalid, the command exits with a message that names the variable.
