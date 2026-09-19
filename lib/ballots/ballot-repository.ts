import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { participants, roundBallots, roundMovies, rounds, rooms, votes } from "@/lib/db/schema";
import type { BallotRepository, BallotRoom, LockedBallotRoom } from "@/lib/ballots/ballot-service";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";

export class DrizzleBallotRepository implements BallotRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async inLockedRoom<T>(roomCode: string, operation: (room: BallotRoom | null, locked: LockedBallotRoom) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();

    return database.transaction(async transaction => {
      const roomRows = await transaction
        .select({ id: rooms.id, status: rooms.status, expiresAt: rooms.expiresAt })
        .from(rooms)
        .where(eq(rooms.code, roomCode))
        .limit(1)
        .for("update");
      const room = roomRows.at(0) ?? null;

      const locked: LockedBallotRoom = {
        findParticipant: async accessTokenHash => {
          if (room === null) {
            return null;
          }

          const participantRows = await transaction
            .select({ id: participants.id })
            .from(participants)
            .where(and(eq(participants.roomId, room.id), eq(participants.accessTokenHash, accessTokenHash)))
            .limit(1);

          return participantRows.at(0) ?? null;
        },
        findBallot: async (participantId, lookup) => {
          if (room === null) {
            return null;
          }

          const lookupCondition = "requestId" in lookup ? eq(roundBallots.requestId, lookup.requestId) : eq(roundBallots.roundId, lookup.roundId);
          const ballotRows = await transaction
            .select({ roundId: roundBallots.roundId, payloadHash: roundBallots.payloadHash })
            .from(roundBallots)
            .where(and(eq(roundBallots.roomId, room.id), eq(roundBallots.participantId, participantId), lookupCondition))
            .limit(1);

          return ballotRows.at(0) ?? null;
        },
        findVotingRound: async () => {
          if (room === null) {
            return null;
          }

          const roundRows = await transaction
            .select({ id: rounds.id })
            .from(rounds)
            .where(and(eq(rounds.roomId, room.id), eq(rounds.status, ROUND_STATUS.VOTING)))
            .limit(1);
          const round = roundRows.at(0) ?? null;

          if (round === null) {
            return null;
          }

          const movieRows = await transaction
            .select({ movieId: roundMovies.movieId })
            .from(roundMovies)
            .where(and(eq(roundMovies.roomId, room.id), eq(roundMovies.roundId, round.id)));

          return { id: round.id, movieIds: movieRows.map(movie => movie.movieId) };
        },
        saveBallot: async input => {
          if (room === null) {
            throw new Error("Cannot save a ballot without a room lock.");
          }

          await transaction.insert(votes).values(
            input.votes.map(vote => ({
              roomId: room.id,
              roundId: input.roundId,
              participantId: input.participantId,
              movieId: vote.movieId,
              value: vote.value,
            })),
          );
          await transaction.insert(roundBallots).values({
            roomId: room.id,
            roundId: input.roundId,
            participantId: input.participantId,
            requestId: input.requestId,
            payloadHash: input.payloadHash,
          });
        },
        countSubmittedBallots: async roundId => {
          if (room === null) {
            return 0;
          }

          const countRows = await transaction
            .select({ count: sql<number>`count(*)::int` })
            .from(roundBallots)
            .where(and(eq(roundBallots.roomId, room.id), eq(roundBallots.roundId, roundId)));

          return countRows.at(0)?.count ?? 0;
        },
        readRoundResolution: async roundId => {
          if (room === null) {
            return null;
          }

          const roundRows = await transaction
            .select({ status: rounds.status })
            .from(rounds)
            .where(and(eq(rounds.roomId, room.id), eq(rounds.id, roundId)))
            .limit(1);
          const round = roundRows.at(0) ?? null;

          if (round === null) {
            return null;
          }

          const [movieRows, ballotRows, voteRows] = await Promise.all([
            transaction
              .select({ movieId: roundMovies.movieId, isSelected: roundMovies.isSelected })
              .from(roundMovies)
              .where(and(eq(roundMovies.roomId, room.id), eq(roundMovies.roundId, roundId))),
            transaction
              .select({ participantId: roundBallots.participantId })
              .from(roundBallots)
              .where(and(eq(roundBallots.roomId, room.id), eq(roundBallots.roundId, roundId))),
            transaction
              .select({ participantId: votes.participantId, movieId: votes.movieId, value: votes.value })
              .from(votes)
              .where(and(eq(votes.roomId, room.id), eq(votes.roundId, roundId))),
          ]);

          return { status: round.status, movies: movieRows, ballots: ballotRows, votes: voteRows };
        },
        persistRoundResolution: async (roundId, resolution) => {
          const currentRoom = this.requireRoom(room);

          if (resolution.status === ROUND_STATUS.MATCHED) {
            const selectedMovies = await transaction
              .update(roundMovies)
              .set({ isSelected: true })
              .where(
                and(
                  eq(roundMovies.roomId, currentRoom.id),
                  eq(roundMovies.roundId, roundId),
                  eq(roundMovies.movieId, resolution.selectedMovieId),
                  eq(roundMovies.isSelected, false),
                ),
              )
              .returning({ movieId: roundMovies.movieId });

            if (selectedMovies.length !== 1) {
              throw new Error("The selected round movie was not persisted.");
            }
          }

          const terminalRounds = await transaction
            .update(rounds)
            .set({ status: resolution.status })
            .where(and(eq(rounds.roomId, currentRoom.id), eq(rounds.id, roundId), eq(rounds.status, ROUND_STATUS.VOTING)))
            .returning({ id: rounds.id });

          if (terminalRounds.length !== 1) {
            throw new Error("The voting round was not transitioned to a terminal state.");
          }

          if (resolution.status === ROUND_STATUS.MATCHED) {
            const matchedRooms = await transaction
              .update(rooms)
              .set({ status: "matched" })
              .where(and(eq(rooms.id, currentRoom.id), eq(rooms.status, "playing")))
              .returning({ id: rooms.id });

            if (matchedRooms.length !== 1) {
              throw new Error("The room was not transitioned to matched.");
            }
          }
        },
      };

      return operation(room, locked);
    });
  }

  private requireRoom(room: BallotRoom | null): BallotRoom {
    if (room === null) {
      throw new Error("Round resolution requires a room lock.");
    }

    return room;
  }
}
