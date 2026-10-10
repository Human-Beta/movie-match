import "server-only";

import { eq } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { roomCreationRequests, rooms } from "@/lib/db/schema";
import { RoomCreationRequestUnavailableError } from "@/lib/rooms/errors";
import type { RoomRepository, RoomSnapshot } from "@/lib/rooms/room-service";

export class DrizzleRoomRepository implements RoomRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async findByCode(code: string): Promise<RoomSnapshot | null> {
    const database = await this.getDatabase();
    const rows = await database
      .select({
        code: rooms.code,
        status: rooms.status,
        expiresAt: rooms.expiresAt,
      })
      .from(rooms)
      .where(eq(rooms.code, code))
      .limit(1);

    return rows.at(0) ?? null;
  }

  async findByCreationRequestId(creationRequestId: string): Promise<RoomSnapshot | null> {
    const database = await this.getDatabase();
    const rows = await database
      .select({
        code: rooms.code,
        status: rooms.status,
        expiresAt: rooms.expiresAt,
      })
      .from(roomCreationRequests)
      .leftJoin(rooms, eq(rooms.creationRequestId, roomCreationRequests.requestId))
      .where(eq(roomCreationRequests.requestId, creationRequestId))
      .limit(1);
    const room = rows.at(0) ?? null;

    if (room === null) {
      return null;
    }
    if (room.code === null || room.status === null || room.expiresAt === null) {
      throw new RoomCreationRequestUnavailableError();
    }
    return { code: room.code, status: room.status, expiresAt: room.expiresAt };
  }

  async tryCreate(code: string, creationRequestId: string): Promise<RoomSnapshot | null> {
    const database = await this.getDatabase();
    const room = await database.transaction(async transaction => {
      const rows = await transaction.insert(rooms).values({ code, creationRequestId }).onConflictDoNothing().returning({
        code: rooms.code,
        status: rooms.status,
        expiresAt: rooms.expiresAt,
      });
      const createdRoom = rows.at(0) ?? null;
      if (createdRoom === null) {
        return null;
      }
      const requests = await transaction
        .insert(roomCreationRequests)
        .values({ requestId: creationRequestId })
        .onConflictDoNothing()
        .returning({ requestId: roomCreationRequests.requestId });
      if (requests.length === 0) {
        throw new RoomCreationRequestUnavailableError();
      }
      return createdRoom;
    });

    return room ?? this.findByCreationRequestId(creationRequestId);
  }
}
