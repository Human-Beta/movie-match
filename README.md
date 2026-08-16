# Movie Match

Movie Match is a web game that helps two people choose a movie for the evening. A TV acts as the shared screen, participants join from their phones through a QR code, and they vote privately until they find a movie they both want to watch.

The product launches as a small but complete Ukrainian-language experience. Support for additional languages is planned for later versions.

## Documentation

- [Documentation index](docs/README.md) — the active product specification and documentation map.
- [Product vision](docs/vision.md) — the problem, audience, principles, and product direction.
- [Technology stack](docs/stack.md) — the agreed technologies and architectural boundaries.
- [Future ideas](docs/ideas.md) — features that are outside the current scope.
- [Task list](tasks/README.md) — implementation order and current progress.

Repository working rules are documented in [AGENTS.md](AGENTS.md).

## Local development

The project requires Node.js 24.15.0 and pnpm 11.0.9. Their versions are pinned in `.nvmrc` and `package.json`.

```bash
pnpm install
cp .env.example .env.local
cp docker-compose.example.yml docker-compose.yml
docker compose --env-file .env.local up -d postgres
pnpm db:migrate
pnpm dev
```

The app is available at [http://localhost:3000](http://localhost:3000) after startup.
See [Database development](docs/database.md) for Supabase variables and migration commands.

## Checks

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
```
