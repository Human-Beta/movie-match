# Database schema

Movie Match stores the shared room, participants, movie catalog, rounds, and votes in PostgreSQL. The schema uses Drizzle's camelCase property names in TypeScript and snake_case column names in PostgreSQL.

The executable sources of truth are `lib/db/schema.ts` and the committed files under `drizzle/`. This guide explains why each table and field exists.

## Enums

### `room_status`

- `waiting` — the room is open and waiting for participants or game setup.
- `playing` — participants are voting in an active game.
- `matched` — the room has produced a shared movie choice.
- `exhausted` — fewer than three eligible unseen movies remain.
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
| `title`                | Non-blank movie title, limited to 200 characters.                                        |
| `release_year`         | Release year; the database rejects values earlier than 1888.                             |
| `runtime_minutes`      | Positive runtime in minutes.                                                             |
| `poster_path`          | Optional non-blank path or URL-like value for poster artwork, limited to 500 characters. |
| `available_on_netflix` | Manually maintained availability flag; defaults to `false`.                              |

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

## Relationship overview

- A movie has many genres through `movie_genres`.
- A room has selected genres through `room_genres`.
- A room has participants and ordered rounds.
- A round has exactly three `round_movies` when round creation completes.
- A participant votes on the round's movies through `votes`.

## Browser access and RLS

Every product table has Row Level Security enabled. Browser roles receive no product-table access by default. Product mutations and protected reads go through validated Next.js server boundaries and Drizzle. Any future browser read or Realtime exposure must add an explicit least-privilege `SELECT` grant and RLS policy in the same migration; browser roles must never receive product-table `INSERT`, `UPDATE`, or `DELETE` privileges.
