import "server-only";

import { eq } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { rooms } from "@/lib/db/schema";

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
      .from(rooms)
      .where(eq(rooms.creationRequestId, creationRequestId))
      .limit(1);

    return rows.at(0) ?? null;
  }

  async tryCreate(code: string, creationRequestId: string): Promise<RoomSnapshot | null> {
    const database = await this.getDatabase();
    const rows = await database.insert(rooms).values({ code, creationRequestId }).onConflictDoNothing().returning({
      code: rooms.code,
      status: rooms.status,
      expiresAt: rooms.expiresAt,
    });
    const room = rows.at(0);

    if (room) {
      return room;
    }

    return this.findByCreationRequestId(creationRequestId);
  }
}
