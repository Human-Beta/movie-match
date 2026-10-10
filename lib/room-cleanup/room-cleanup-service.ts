import { timingSafeEqual } from "node:crypto";

export type RoomCleanupRepository = { deleteExpiredBatch(): Promise<number> };
export type RoomCleanupResult = { status: "completed" | "failed"; deletedRooms: number };
export const ROOM_CLEANUP_MAX_BATCHES = 10;

export class RoomCleanupService {
  constructor(private readonly repository: RoomCleanupRepository) {}

  async run(): Promise<RoomCleanupResult> {
    let deletedRooms = 0;
    try {
      for (let batch = 0; batch < ROOM_CLEANUP_MAX_BATCHES; batch += 1) {
        const deleted = await this.repository.deleteExpiredBatch();
        deletedRooms += deleted;
        if (deleted === 0) {
          break;
        }
      }
      return { status: "completed", deletedRooms };
    } catch {
      // Never include database errors: drivers may attach queries or connection details.
      return { status: "failed", deletedRooms };
    }
  }
}

export function isCleanupAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || authorization === null) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
