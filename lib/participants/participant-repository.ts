import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { participants, rooms } from "@/lib/db/schema";
import type { LockedParticipantRoom, ParticipantRepository, ParticipantRoom, ParticipantRoomSnapshot } from "@/lib/participants/participant-service";

const roomSelection = {
  id: rooms.id,
  code: rooms.code,
  status: rooms.status,
  expiresAt: rooms.expiresAt,
};

const participantSelection = {
  id: participants.id,
  name: participants.name,
  role: participants.role,
};

export class DrizzleParticipantRepository implements ParticipantRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async inspectRoom(roomCode: string, accessTokenHash: string | null): Promise<ParticipantRoomSnapshot> {
    const database = await this.getDatabase();

    return database.transaction(async transaction => {
      const roomRows = await transaction.select(roomSelection).from(rooms).where(eq(rooms.code, roomCode)).limit(1);
      const room = roomRows.at(0) ?? null;

      if (!room) {
        return { room: null, participant: null, participantCount: 0 };
      }

      const participantCountRows = await transaction
        .select({ participantCount: sql<number>`count(*)::int` })
        .from(participants)
        .where(eq(participants.roomId, room.id));
      const participantCount = participantCountRows.at(0)?.participantCount ?? 0;
      const participantRows = accessTokenHash
        ? await transaction
            .select(participantSelection)
            .from(participants)
            .where(and(eq(participants.roomId, room.id), eq(participants.accessTokenHash, accessTokenHash)))
            .limit(1)
        : [];

      return {
        room,
        participant: participantRows.at(0) ?? null,
        participantCount,
      };
    });
  }

  async inLockedRoom<T>(roomCode: string, operation: (room: ParticipantRoom | null, lockedRoom: LockedParticipantRoom) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();

    return database.transaction(async transaction => {
      const roomRows = await transaction.select(roomSelection).from(rooms).where(eq(rooms.code, roomCode)).limit(1).for("update");
      const room = roomRows.at(0) ?? null;

      const lockedRoom: LockedParticipantRoom = {
        findParticipantByAccessTokenHash: async accessTokenHash => {
          if (!room) {
            return null;
          }

          const participantRows = await transaction
            .select(participantSelection)
            .from(participants)
            .where(and(eq(participants.roomId, room.id), eq(participants.accessTokenHash, accessTokenHash)))
            .limit(1);

          return participantRows.at(0) ?? null;
        },
        listParticipantRoles: async () => {
          if (!room) {
            return [];
          }

          const rows = await transaction.select({ role: participants.role }).from(participants).where(eq(participants.roomId, room.id));

          return rows.map(participant => participant.role);
        },
        createParticipant: async input => {
          if (!room) {
            throw new Error("Cannot create a participant without a room lock.");
          }

          const participantRows = await transaction
            .insert(participants)
            .values({ roomId: room.id, ...input })
            .returning(participantSelection);
          const participant = participantRows.at(0);

          if (!participant) {
            throw new Error("The participant insert returned no row.");
          }

          return participant;
        },
      };

      return operation(room, lockedRoom);
    });
  }
}
