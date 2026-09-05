import "server-only";

import { eq, type SQL } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { participants, rooms } from "@/lib/db/schema";
import type { ParticipantSnapshotRecord, ParticipantSnapshotRepository } from "@/lib/participants/participant-snapshot-service";

export class DrizzleParticipantSnapshotRepository implements ParticipantSnapshotRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async findByRoomCode(roomCode: string): Promise<ParticipantSnapshotRecord | null> {
    return this.findSnapshot(eq(rooms.code, roomCode));
  }

  async findByRoomId(roomId: string): Promise<ParticipantSnapshotRecord | null> {
    return this.findSnapshot(eq(rooms.id, roomId));
  }

  private async findSnapshot(condition: SQL): Promise<ParticipantSnapshotRecord | null> {
    const database = await this.getDatabase();
    const rows = await database
      .select({
        roomId: rooms.id,
        roomCode: rooms.code,
        roomState: rooms.status,
        roomExpiresAt: rooms.expiresAt,
        participantName: participants.name,
        participantRole: participants.role,
      })
      .from(rooms)
      .leftJoin(participants, eq(participants.roomId, rooms.id))
      .where(condition);
    const firstRow = rows.at(0) ?? null;

    if (firstRow === null) {
      return null;
    }

    return {
      room: {
        id: firstRow.roomId,
        code: firstRow.roomCode,
        status: firstRow.roomState,
        expiresAt: firstRow.roomExpiresAt,
      },
      participants: rows.flatMap(row =>
        row.participantName !== null && row.participantRole !== null ? [{ name: row.participantName, role: row.participantRole }] : [],
      ),
    };
  }
}
