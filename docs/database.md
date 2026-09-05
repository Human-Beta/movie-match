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

The repository includes `docker-compose.example.yml` for testing Drizzle migrations and server-side database code without connecting to a hosted project. Start a Docker engine, then create the local working files:

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
pnpm dev:local
```

This command waits for PostgreSQL to become healthy, applies pending migrations, and starts the application. JetBrains IDEs expose the same workflow through the shared **Local development** run configuration. The container exposes PostgreSQL only on localhost and creates local stand-ins for the Supabase Data API roles so the security migration can be tested. Stop it with `docker compose down`; add `--volumes` only when intentionally deleting the local database.

This is deliberately a database-only setup. It does not provide Supabase Realtime, Data API, Auth, or Studio. Use a hosted Supabase project for those services. If the project later needs the complete Supabase platform offline, use the official Supabase CLI local stack instead of maintaining all Supabase services by hand in this Compose file.

## Run the app over local HTTPS

On macOS, run the development server over HTTPS when testing secure browser APIs from phones on the same network:

```bash
pnpm dev:https
```

The script installs `mkcert` with Homebrew when available, trusts its local development CA on the Mac, detects the active LAN IPv4 address and macOS `.local` hostname, and starts Next.js on all network interfaces. It creates the certificate, private key, and a copy of the public root CA under the gitignored `.local/https/` directory. Set `MOVIE_MATCH_LAN_IP` or `MOVIE_MATCH_LOCAL_HOSTNAME` before the command only when automatic detection selects the wrong interface or hostname.

Before opening the printed HTTPS URL on a phone for the first time, transfer only `.local/https/rootCA.pem` to that phone, install it as a CA profile, and enable full trust for it in the operating-system certificate settings. Never transfer or expose the `rootCA-key.pem` file from the `mkcert` CA directory. The phone and Mac must be on the same network, and client isolation must be disabled on that network.

## Verify hosted participant Realtime

Apply the committed migrations to a hosted Supabase project, then configure its connection string, project URL, and publishable key in the ignored `.env.local`. Start the app and open `/tv` plus its join URL in three isolated browser contexts: one TV, phone 1, and phone 2.

Use the TV browser's Network panel with Preserve log enabled to distinguish Broadcast invalidation from the five-second authoritative fallback:

1. Before either phone joins, confirm the TV's Realtime WebSocket receives a successful room-channel join reply. The topic must contain the internal room UUID rather than the short room code.
2. Join phone 1 immediately after a scheduled snapshot request. Before the next fallback interval, confirm an incoming `participants_changed` Broadcast frame with an empty payload, a subsequent participant snapshot Server Action request, and then `1/2` plus the host's name on the TV.
3. Repeat for phone 2. Confirm the same event-then-refetch sequence produces `2/2`, and phone 1 changes from waiting to ready. Reload the TV and one joined phone to confirm both restore the authoritative database state.
4. Send two duplicate `participants_changed` events with a forged participant-shaped payload. The UI must ignore the payload, perform one coalesced authoritative refetch, and never render the forged participant.
5. Run the app with an unreachable Supabase project URL and repeat a join. The committed join must still succeed after the bounded Broadcast attempts, and the open TV must converge through its next waiting-state snapshot refresh without a manual reload.

Do not record project keys, room topics, participant credentials, or database passwords in screenshots, logs, or committed files. The Realtime check does not require a service-role or secret key, browser Data API access, Postgres Changes publication, or product-table grants.

## Create and apply migrations

After changing `lib/db/schema.ts`, generate a migration and inspect the generated SQL before applying it:

```bash
pnpm db:generate
pnpm db:migrate
```

Drizzle Kit writes generated migration files to `drizzle/`. Commit schema changes and their generated migrations together. Keep Data API access opt-in: migrations that introduce product tables must enable RLS, and migrations that expose browser reads or Realtime events must grant only the access required by that feature.

Both migration commands load `DATABASE_URL` from `.env.local`. If it is missing or invalid, the command exits with a message that names the variable.
