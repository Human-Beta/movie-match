import "server-only";

import { sql } from "drizzle-orm";
import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import type { RoomCleanupRepository } from "@/lib/room-cleanup/room-cleanup-service";

export const ROOM_CLEANUP_BATCH_SIZE = 100;

export class DrizzleRoomCleanupRepository implements RoomCleanupRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async deleteExpiredBatch(): Promise<number> {
    const database = await this.getDatabase();
    return database.transaction(async transaction => {
      await transaction.execute(sql`set local lock_timeout = '1s'`);
      await transaction.execute(sql`set local statement_timeout = '4s'`);
      const deleted = await transaction.execute(sql`
        with expired as (
          select id from rooms
          where expires_at <= statement_timestamp()
          order by expires_at, id
          limit ${ROOM_CLEANUP_BATCH_SIZE}
          for update skip locked
        )
        delete from rooms using expired where rooms.id = expired.id returning rooms.id
      `);
      return deleted.length;
    });
  }
}
