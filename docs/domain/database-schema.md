# Database schema

Movie Match stores the shared room, participants, movie catalog, rounds, and votes in PostgreSQL. The schema uses Drizzle's camelCase property names in TypeScript and snake_case column names in PostgreSQL.

The executable sources of truth are `lib/db/schema.ts` and the committed files under `drizzle/`. This guide explains why each table and field exists.

## Enums

### `room_status`

- `waiting` — the room is open and waiting for participants or game setup.
- `playing` — participants are voting in an active game.
- `matched` — the room has produced a shared movie choice.
- `exhausted` — fewer than three unseen movies remain while the complete filtered catalog can form a round, so the host can restart the shown list.
- `closed` — the room is no longer available for play or restoration.

### `participant_role`

- `host` — the first participant, who controls filters and game actions.
- `guest` — the second participant.

### `year_filter`

- `any` — do not filter movies by release year.
- `new` — include movies released after 2010.
- `old` — include movies released in or before 2010.

### `round_status`

- `voting` — votes are still being collected.
- `matched` — this round produced a match.
- `no_match` — this round finished without a match.

### `vote_value`

- `want_to_watch` — the strongest positive vote.
- `could_watch` — a positive vote.
- `not_now` — a negative vote for the current choice.
- `no` — the strongest negative vote.

### `room_game_command`

- `start` — creates the first round from the saved filters.
- `restart` — replaces exhausted room history with a new first round.

### `room_game_command_outcome`

- `started` — the command atomically created a complete round.
- `catalog_insufficient` — the command found fewer than three movies in the complete filtered catalog.
- `list_exhausted` — the command found fewer than three unseen movies while the complete filtered catalog contains at least three.

## Tables

### `genres`

The canonical list of movie genres.

| Field  | Purpose                                                 |
| ------ | ------------------------------------------------------- |
| `id`   | Integer identity primary key.                           |
| `name` | Unique, non-blank genre name, limited to 50 characters. |

### `movies`

The first-party movie catalog used to generate rounds.

| Field                  | Purpose                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `id`                   | Integer identity primary key.                                                            |
| `seed_key`             | Optional unique stable identity for catalog records managed by the versioned seed.       |
| `title`                | Non-blank movie title, limited to 200 characters.                                        |
| `release_year`         | Release year; the database rejects values earlier than 1888.                             |
| `runtime_minutes`      | Positive runtime in minutes.                                                             |
| `poster_path`          | Optional non-blank path or URL-like value for poster artwork, limited to 500 characters. |
| `available_on_netflix` | Manually maintained availability flag; defaults to `false`.                              |

`seed_key` is null for movies created outside the maintained seed. Re-running the seed updates a movie through this key without changing its integer ID; removing an entry from the source file does not delete its existing row.

### `movie_genres`

A many-to-many join between movies and genres.

| Field      | Purpose                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `movie_id` | References `movies.id`; deleting a movie removes its genre links.              |
| `genre_id` | References `genres.id`; a genre cannot be deleted while a movie still uses it. |

The pair `(movie_id, genre_id)` is the primary key. An additional `(genre_id, movie_id)` index supports genre-first filtering.

### `rooms`

One shared movie-selection session displayed on a TV and controlled from phones.

| Field                 | Purpose                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | Random UUID primary key used by internal relationships.                                                                                                                                                  |
| `code`                | Unique human-readable room code. It must contain 4–8 uppercase letters or digits.                                                                                                                        |
| `creation_request_id` | Optional unique browser-generated UUID that makes room creation idempotent across reloads, interrupted responses, and concurrent retries. Existing rows created before this mechanism may leave it null. |
| `status`              | Current `room_status`; defaults to `waiting`.                                                                                                                                                            |
| `netflix_only`        | Whether filters require the manually maintained Netflix flag; defaults to `false`.                                                                                                                       |
| `under_two_hours`     | Whether filters require a runtime below two hours; defaults to `false`.                                                                                                                                  |
| `year_filter`         | Selected `year_filter`; defaults to `any`.                                                                                                                                                               |
| `created_at`          | Creation timestamp; defaults to the current database time.                                                                                                                                               |
| `expires_at`          | Expiration timestamp. A constraint requires exactly one hour after `created_at`.                                                                                                                         |

An index on `expires_at` for non-closed rooms supports active-room expiration queries.

### `room_genres`

The genres selected as filters for a room. No rows means that every genre is allowed.

| Field      | Purpose                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `room_id`  | References `rooms.id`; deleting the room removes its selected genres.   |
| `genre_id` | References `genres.id`; a genre cannot be deleted while a room uses it. |

The pair `(room_id, genre_id)` is the primary key. An additional `(genre_id, room_id)` index supports genre-first lookups.

### `room_filter_saves`

Successful host filter-save receipts. The dedicated table scopes request IDs to the filter-save command; it stores no participant credentials or historical filter payloads.

| Field          | Purpose                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| `room_id`      | References `rooms.id`; deleting the room removes its receipts.                        |
| `request_id`   | Browser-generated UUID persisted with the pending filter values before submission.    |
| `payload_hash` | SHA-256 of the validated, canonical filter values, including sorted unique genre IDs. |

The primary key `(room_id, request_id)` prevents duplicate receipts. A receipt commits in the same transaction as the scalar filters and complete `room_genres` replacement. The transaction locks the `rooms` row, verifies the unexpired `waiting` state and room-scoped host credential, then either saves once or handles a retry. Matching retries return the current filters without applying the old payload again; a different payload using an existing key is rejected.

RLS is enabled, and `anon`, `authenticated`, and `service_role` receive no table privileges. Access remains server-side through Drizzle. Expiration cleanup can remove these receipts through the room foreign-key cascade.

### `room_game_commands`

Committed host start and list-restart receipts. The table makes game commands recoverable after double clicks, concurrent requests, reloads, and lost responses without storing participant credentials or client-provided movie choices.

| Field          | Purpose                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `room_id`      | References `rooms.id`; deleting the room removes its command receipts.                             |
| `request_id`   | Browser-generated UUID persisted before the start or restart request.                              |
| `command`      | The canonical `room_game_command` kind: `start` or `restart`.                                      |
| `payload_hash` | SHA-256 of the validated command kind and normalized room code.                                    |
| `filter_hash`  | SHA-256 of the canonical saved filter contract used for the command.                               |
| `outcome`      | The committed `room_game_command_outcome`: `started`, `catalog_insufficient`, or `list_exhausted`. |

The primary key `(room_id, request_id)` scopes uniqueness to a room and conflicts when a key is reused for another command payload. The receipt is inserted in the same room-locking transaction as the complete three-position round, the `list_exhausted` transition, or a host-local `catalog_insufficient` outcome. Matching retries return the recorded outcome before inspecting later game state, so an old request cannot create or delete a later round. A catalog-insufficient receipt also tells the host form not to offer another start for the same saved filter contract.

RLS is enabled, and browser roles receive no table privileges. Access remains server-side through Drizzle, and room expiration cleanup removes receipts through the room foreign-key cascade.

### `participants`

The two people connected to a room from their phones.

| Field               | Purpose                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`                | Random UUID participant identifier.                                                                                       |
| `room_id`           | References `rooms.id`; deleting the room removes its participants.                                                        |
| `role`              | `host` or `guest`. A room may contain at most one participant of each role.                                               |
| `name`              | Non-blank display name, limited to 50 characters.                                                                         |
| `access_token_hash` | Unique hash of the participant credential; only the hash is stored, and it must contain at least 32 non-blank characters. |

The unique pair `(room_id, id)` supports composite references that prove a participant belongs to the same room as a vote.

### `rounds`

An ordered voting round inside a room.

| Field          | Purpose                                                      |
| -------------- | ------------------------------------------------------------ |
| `id`           | Random UUID round identifier.                                |
| `room_id`      | References `rooms.id`; deleting the room removes its rounds. |
| `round_number` | Positive sequence number unique within the room.             |
| `status`       | Current `round_status`; defaults to `voting`.                |

The unique pair `(room_id, id)` supports composite child references. A partial unique index permits at most one `voting` round per room.

### `round_movies`

The three movie positions presented in a round.

| Field         | Purpose                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `room_id`     | Part of the composite reference to the owning round.                                                    |
| `round_id`    | Part of the composite reference to `rounds`; deleting the round removes its movie positions.            |
| `movie_id`    | References `movies.id`; referenced catalog movies cannot be deleted.                                    |
| `position`    | Display position from 1 through 3. Each position is unique within a round.                              |
| `is_selected` | Whether this movie won the round; defaults to `false`, and at most one movie may be selected per round. |

The composite primary key is `(room_id, round_id, movie_id)`. `(room_id, movie_id)` is unique so a movie cannot reappear anywhere in the room's current round history.

### `votes`

One participant's private reaction to one movie in one round.

| Field            | Purpose                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `room_id`        | Ensures the round movie and participant belong to the same room. |
| `round_id`       | Identifies the round being voted on.                             |
| `participant_id` | Identifies the participant casting the vote.                     |
| `movie_id`       | Identifies the movie receiving the vote.                         |
| `value`          | The selected `vote_value`.                                       |

The composite primary key `(room_id, round_id, participant_id, movie_id)` permits one vote per participant and movie. Composite foreign keys require both a valid round-movie entry and a participant from the same room. Deleting either parent removes the vote.

### `round_ballots`

The committed completion marker for one participant's complete private ballot. It is deliberately separate from the individual `votes`: a receipt exists only after the three validated vote rows have been inserted in the same transaction.

| Field            | Purpose                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `room_id`        | Scopes the marker to the room and contributes to both composite ownership references.      |
| `round_id`       | Identifies the persisted round.                                                            |
| `participant_id` | Identifies the participant whose ballot became immutable.                                  |
| `request_id`     | Browser-generated UUID retained only for safe replay of this participant's ballot request. |
| `payload_hash`   | SHA-256 of the canonical room code, round ID, and movie-ID/value pairs sorted by movie ID. |

The primary key `(room_id, round_id, participant_id)` permits exactly one completed ballot for a participant and round. The additional unique constraint `(room_id, participant_id, request_id)` makes a request ID single-use across every round for that participant while allowing the same UUID for another participant or room. Its composite foreign keys prove that both the round and participant belong to the same room; room or round deletion cascades to the marker. The hash format is checked by PostgreSQL. The service finds a receipt by its participant/request namespace before checking the current round, then compares its stored round ID and hash: only an exact replay returns the committed outcome, while a changed payload or cross-round reuse conflicts without changing votes.

RLS is enabled, and `anon`, `authenticated`, and `service_role` receive no privileges. The marker, request ID, and hash remain server-only; snapshots expose only an aggregate completed-ballot count and, for an authenticated phone, that phone's own values.

## Relationship overview

- A movie has many genres through `movie_genres`.
- A room has selected genres through `room_genres`.
- A room has participants, filter-save receipts, game-command receipts, ballot receipts, and ordered rounds.
- A round has exactly three `round_movies` when round creation completes.
- A participant votes on the round's movies through `votes`.
- A participant can complete one immutable `round_ballots` receipt for a round.

## Browser access and RLS

Every product table has Row Level Security enabled. Browser roles receive no product-table access by default. Product mutations and protected reads go through validated Next.js server boundaries and Drizzle. Any future browser read or Realtime exposure must add an explicit least-privilege `SELECT` grant and RLS policy in the same migration; browser roles must never receive product-table `INSERT`, `UPDATE`, or `DELETE` privileges.
