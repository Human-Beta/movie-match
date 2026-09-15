import { z } from "zod";

import { SystemClock, type Clock } from "@/lib/clock";
import type { ParticipantRole } from "@/lib/participants/participant-service";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import {
  isPublicRoomMovies,
  type ParticipantClientSnapshot,
  type ParticipantOwnBallot,
  type PublicBallotProgress,
  type PublicParticipantSnapshot,
  type PublicRoomMovie,
  type PublicRoomMovies,
  type PublicRoomParticipant,
  type PublicRoomRound,
} from "@/lib/participants/public-participant-snapshot";
import { PARTICIPANT_ROOM_TOPIC_PREFIX } from "@/lib/realtime/participant-events";
import { normalizeRoomCode } from "@/lib/rooms/room-code";
import type { RoomStatus } from "@/lib/rooms/room-service";

const roomIdSchema = z.uuid();

export type ParticipantSnapshotRecord = {
  room: {
    id: string;
    code: string;
    status: RoomStatus;
    expiresAt: Date;
  };
  participants: PublicRoomParticipant[];
  currentRound: PublicRoomRound | null;
  submittedBallotCount: number;
  ownBallot: ParticipantOwnBallot | null;
};

export type ParticipantSnapshotRepository = {
  findByRoomCode(roomCode: string): Promise<ParticipantSnapshotRecord | null>;
  findByRoomId(roomId: string): Promise<ParticipantSnapshotRecord | null>;
  findByRoomIdForParticipant(roomId: string, accessTokenHash: string): Promise<ParticipantSnapshotRecord | null>;
};

export type TvParticipantRoomState = {
  roomCode: string;
  realtimeTopic: string;
  snapshot: PublicParticipantSnapshot;
};

function getParticipantRoleOrder(role: ParticipantRole): number {
  return role === "host" ? 0 : 1;
}

export function createParticipantRealtimeTopic(roomId: string): string {
  const parsedRoomId = roomIdSchema.safeParse(roomId);

  if (!parsedRoomId.success) {
    throw new Error("Cannot create a participant topic from an invalid room ID.");
  }

  return `${PARTICIPANT_ROOM_TOPIC_PREFIX}${parsedRoomId.data}`;
}

export function getRoomIdFromParticipantRealtimeTopic(realtimeTopic: string): string | null {
  if (!realtimeTopic.startsWith(PARTICIPANT_ROOM_TOPIC_PREFIX)) {
    return null;
  }

  const parsedRoomId = roomIdSchema.safeParse(realtimeTopic.slice(PARTICIPANT_ROOM_TOPIC_PREFIX.length));

  return parsedRoomId.success ? parsedRoomId.data : null;
}

export class ParticipantSnapshotService {
  constructor(
    private readonly repository: ParticipantSnapshotRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async getTvRoomState(roomCode: string): Promise<TvParticipantRoomState | null> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (normalizedRoomCode === null) {
      return null;
    }

    const record = await this.repository.findByRoomCode(normalizedRoomCode);

    if (record === null) {
      return null;
    }

    const snapshot = this.toPublicSnapshot(record);

    if (snapshot.roomState === "closed") {
      return null;
    }

    return {
      roomCode: record.room.code,
      realtimeTopic: createParticipantRealtimeTopic(record.room.id),
      snapshot,
    };
  }

  async getClientRoomState(
    roomId: string,
    storedAccessToken: string | null,
  ): Promise<{ realtimeTopic: string; snapshot: ParticipantClientSnapshot } | null> {
    const parsedRoomId = roomIdSchema.safeParse(roomId);
    const accessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);

    if (!parsedRoomId.success || accessTokenHash === null) {
      return null;
    }

    const record = await this.repository.findByRoomIdForParticipant(parsedRoomId.data, accessTokenHash);

    if (record === null) {
      return null;
    }

    const snapshot = this.toParticipantSnapshot(record);

    if (snapshot.roomState === "closed") {
      return null;
    }

    return {
      realtimeTopic: createParticipantRealtimeTopic(record.room.id),
      snapshot,
    };
  }

  async getSnapshotForTopic(realtimeTopic: string): Promise<PublicParticipantSnapshot | null> {
    const roomId = getRoomIdFromParticipantRealtimeTopic(realtimeTopic);

    if (roomId === null) {
      return null;
    }

    const record = await this.repository.findByRoomId(roomId);

    return record === null ? null : this.toPublicSnapshot(record);
  }

  async getSnapshotForTopicForParticipant(realtimeTopic: string, storedAccessToken: string | null): Promise<ParticipantClientSnapshot | null> {
    const roomId = getRoomIdFromParticipantRealtimeTopic(realtimeTopic);
    const accessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);

    if (roomId === null || accessTokenHash === null) {
      return null;
    }

    const record = await this.repository.findByRoomIdForParticipant(roomId, accessTokenHash);

    return record === null ? null : this.toParticipantSnapshot(record);
  }

  toPublicSnapshot(record: ParticipantSnapshotRecord): PublicParticipantSnapshot {
    const roomState = this.getPublicRoomState(record.room.status, record.room.expiresAt);
    const participants = record.participants
      .map((participant): PublicRoomParticipant => ({
        name: participant.name,
        role: participant.role,
      }))
      .sort((left, right) => getParticipantRoleOrder(left.role) - getParticipantRoleOrder(right.role));
    const ballotProgress = this.toBallotProgress(record, participants.length);

    return {
      roomState,
      participantCount: participants.length,
      participants,
      currentRound: this.publicRound(record.currentRound),
      ballotProgress,
    };
  }

  private toParticipantSnapshot(record: ParticipantSnapshotRecord): ParticipantClientSnapshot {
    const publicSnapshot = this.toPublicSnapshot(record);
    const ownBallot = this.copyOwnBallot(record.ownBallot);

    return {
      ...publicSnapshot,
      ownBallot,
    };
  }

  private toBallotProgress(record: ParticipantSnapshotRecord, totalParticipants: number): PublicBallotProgress | null {
    if (record.currentRound?.status !== "voting") {
      return null;
    }

    return {
      submittedCount: record.submittedBallotCount,
      totalParticipants,
      readyForResults: record.submittedBallotCount === totalParticipants,
    };
  }

  private copyOwnBallot(ballot: ParticipantOwnBallot | null): ParticipantOwnBallot | null {
    if (ballot === null || ballot.status === "not_submitted") {
      return ballot;
    }

    return {
      status: "submitted",
      votes: ballot.votes.map(vote => ({ movieId: vote.movieId, value: vote.value })),
    };
  }

  private publicRound(round: PublicRoomRound | null): PublicRoomRound | null {
    if (round === null) {
      return null;
    }

    const orderedMovies = [...round.movies].sort((left, right) => left.position - right.position);

    if (!isPublicRoomMovies(orderedMovies)) {
      throw new Error("The current round must contain three movies in positions 1 through 3.");
    }

    return {
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      status: round.status,
      movies: this.copyMovies(orderedMovies),
    };
  }

  private copyMovies(movies: PublicRoomMovies): PublicRoomMovies {
    return [this.copyMovie(movies[0]), this.copyMovie(movies[1]), this.copyMovie(movies[2])];
  }

  private copyMovie(movie: PublicRoomMovie): PublicRoomMovie {
    return {
      movieId: movie.movieId,
      position: movie.position,
      title: movie.title,
      posterPath: movie.posterPath,
      releaseYear: movie.releaseYear,
      runtimeMinutes: movie.runtimeMinutes,
      genres: [...movie.genres],
    };
  }

  private getPublicRoomState(status: RoomStatus, expiresAt: Date): RoomStatus {
    if (status === "closed" || expiresAt.getTime() <= this.clock.now().getTime()) {
      return "closed";
    }

    return status;
  }
}
