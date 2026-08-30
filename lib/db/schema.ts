import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const roomStatusEnum = pgEnum("room_status", ["waiting", "playing", "matched", "exhausted", "closed"]);

export const participantRoleEnum = pgEnum("participant_role", ["host", "guest"]);

export const yearFilterEnum = pgEnum("year_filter", ["any", "new", "old"]);

export const roundStatusEnum = pgEnum("round_status", ["voting", "matched", "no_match"]);

export const voteValueEnum = pgEnum("vote_value", ["want_to_watch", "could_watch", "not_now", "no"]);

export const genres = pgTable(
  "genres",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
  },
  table => [unique("genres_name_unique").on(table.name), check("genres_name_not_blank", sql`btrim(${table.name}) <> ''`)],
).enableRLS();

export const movies = pgTable(
  "movies",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    releaseYear: smallint("release_year").notNull(),
    runtimeMinutes: smallint("runtime_minutes").notNull(),
    posterPath: varchar("poster_path", { length: 500 }),
    availableOnNetflix: boolean("available_on_netflix").default(false).notNull(),
  },
  table => [
    check("movies_title_not_blank", sql`btrim(${table.title}) <> ''`),
    check("movies_release_year_check", sql`${table.releaseYear} >= 1888`),
    check("movies_runtime_minutes_check", sql`${table.runtimeMinutes} > 0`),
    check("movies_poster_path_not_blank", sql`${table.posterPath} is null or btrim(${table.posterPath}) <> ''`),
  ],
).enableRLS();

export const movieGenres = pgTable(
  "movie_genres",
  {
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "restrict" }),
  },
  table => [
    primaryKey({
      name: "movie_genres_pkey",
      columns: [table.movieId, table.genreId],
    }),
    index("movie_genres_genre_movie_idx").on(table.genreId, table.movieId),
  ],
).enableRLS();

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 8 }).notNull(),
    creationRequestId: uuid("creation_request_id"),
    status: roomStatusEnum("status").default("waiting").notNull(),
    netflixOnly: boolean("netflix_only").default(false).notNull(),
    underTwoHours: boolean("under_two_hours").default(false).notNull(),
    yearFilter: yearFilterEnum("year_filter").default("any").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '1 hour'`)
      .notNull(),
  },
  table => [
    unique("rooms_code_unique").on(table.code),
    unique("rooms_creation_request_id_unique").on(table.creationRequestId),
    check("rooms_code_format_check", sql`${table.code} ~ '^[A-Z0-9]{4,8}$'`),
    check("rooms_lifetime_check", sql`${table.expiresAt} = ${table.createdAt} + interval '1 hour'`),
    index("rooms_active_expires_at_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} <> 'closed'`),
  ],
).enableRLS();

export const roomGenres = pgTable(
  "room_genres",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "restrict" }),
  },
  table => [
    primaryKey({
      name: "room_genres_pkey",
      columns: [table.roomId, table.genreId],
    }),
    index("room_genres_genre_room_idx").on(table.genreId, table.roomId),
  ],
).enableRLS();

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    role: participantRoleEnum("role").notNull(),
    name: varchar("name", { length: 50 }).notNull(),
    accessTokenHash: varchar("access_token_hash", { length: 128 }).notNull(),
  },
  table => [
    unique("participants_room_role_unique").on(table.roomId, table.role),
    unique("participants_room_id_id_unique").on(table.roomId, table.id),
    unique("participants_access_token_hash_unique").on(table.accessTokenHash),
    check("participants_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("participants_access_token_hash_check", sql`char_length(btrim(${table.accessTokenHash})) >= 32`),
  ],
).enableRLS();

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    status: roundStatusEnum("status").default("voting").notNull(),
  },
  table => [
    unique("rounds_room_round_number_unique").on(table.roomId, table.roundNumber),
    unique("rounds_room_id_id_unique").on(table.roomId, table.id),
    uniqueIndex("rounds_one_voting_per_room_unique")
      .on(table.roomId)
      .where(sql`${table.status} = 'voting'`),
    check("rounds_round_number_check", sql`${table.roundNumber} > 0`),
  ],
).enableRLS();

export const roundMovies = pgTable(
  "round_movies",
  {
    roomId: uuid("room_id").notNull(),
    roundId: uuid("round_id").notNull(),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "restrict" }),
    position: smallint("position").notNull(),
    isSelected: boolean("is_selected").default(false).notNull(),
  },
  table => [
    primaryKey({
      name: "round_movies_pkey",
      columns: [table.roomId, table.roundId, table.movieId],
    }),
    foreignKey({
      name: "round_movies_room_round_fk",
      columns: [table.roomId, table.roundId],
      foreignColumns: [rounds.roomId, rounds.id],
    }).onDelete("cascade"),
    unique("round_movies_room_movie_unique").on(table.roomId, table.movieId),
    unique("round_movies_round_position_unique").on(table.roundId, table.position),
    uniqueIndex("round_movies_selected_round_unique")
      .on(table.roundId)
      .where(sql`${table.isSelected} = true`),
    check("round_movies_position_check", sql`${table.position} between 1 and 3`),
  ],
).enableRLS();

export const votes = pgTable(
  "votes",
  {
    roomId: uuid("room_id").notNull(),
    roundId: uuid("round_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    movieId: integer("movie_id").notNull(),
    value: voteValueEnum("value").notNull(),
  },
  table => [
    primaryKey({
      name: "votes_pkey",
      columns: [table.roomId, table.roundId, table.participantId, table.movieId],
    }),
    foreignKey({
      name: "votes_round_movie_fk",
      columns: [table.roomId, table.roundId, table.movieId],
      foreignColumns: [roundMovies.roomId, roundMovies.roundId, roundMovies.movieId],
    }).onDelete("cascade"),
    foreignKey({
      name: "votes_room_participant_fk",
      columns: [table.roomId, table.participantId],
      foreignColumns: [participants.roomId, participants.id],
    }).onDelete("cascade"),
    index("votes_round_movie_idx").on(table.roomId, table.roundId, table.movieId),
    index("votes_room_participant_idx").on(table.roomId, table.participantId),
  ],
).enableRLS();

export const genresRelations = relations(genres, ({ many }) => ({
  movieGenres: many(movieGenres),
  roomGenres: many(roomGenres),
}));

export const moviesRelations = relations(movies, ({ many }) => ({
  movieGenres: many(movieGenres),
  roundMovies: many(roundMovies),
}));

export const movieGenresRelations = relations(movieGenres, ({ one }) => ({
  movie: one(movies, {
    fields: [movieGenres.movieId],
    references: [movies.id],
  }),
  genre: one(genres, {
    fields: [movieGenres.genreId],
    references: [genres.id],
  }),
}));

export const roomsRelations = relations(rooms, ({ many }) => ({
  genres: many(roomGenres),
  participants: many(participants),
  rounds: many(rounds),
}));

export const roomGenresRelations = relations(roomGenres, ({ one }) => ({
  room: one(rooms, {
    fields: [roomGenres.roomId],
    references: [rooms.id],
  }),
  genre: one(genres, {
    fields: [roomGenres.genreId],
    references: [genres.id],
  }),
}));

export const participantsRelations = relations(participants, ({ many, one }) => ({
  room: one(rooms, {
    fields: [participants.roomId],
    references: [rooms.id],
  }),
  votes: many(votes),
}));

export const roundsRelations = relations(rounds, ({ many, one }) => ({
  room: one(rooms, {
    fields: [rounds.roomId],
    references: [rooms.id],
  }),
  movies: many(roundMovies),
}));

export const roundMoviesRelations = relations(roundMovies, ({ many, one }) => ({
  round: one(rounds, {
    fields: [roundMovies.roomId, roundMovies.roundId],
    references: [rounds.roomId, rounds.id],
  }),
  movie: one(movies, {
    fields: [roundMovies.movieId],
    references: [movies.id],
  }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  roundMovie: one(roundMovies, {
    fields: [votes.roomId, votes.roundId, votes.movieId],
    references: [roundMovies.roomId, roundMovies.roundId, roundMovies.movieId],
  }),
  participant: one(participants, {
    fields: [votes.roomId, votes.participantId],
    references: [participants.roomId, participants.id],
  }),
}));
