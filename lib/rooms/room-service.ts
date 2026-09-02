import { SystemClock, type Clock } from "@/lib/clock";
import { RoomCreationAttemptsExhaustedError, RoomCreationRequestUnavailableError } from "@/lib/rooms/errors";
import { generateRoomCode, normalizeRoomCode } from "@/lib/rooms/room-code";

export const ROOM_CREATE_MAX_ATTEMPTS = 5;

export type RoomStatus = "waiting" | "playing" | "matched" | "exhausted" | "closed";

export type RoomSnapshot = {
  code: string;
  status: RoomStatus;
  expiresAt: Date;
};

export type RoomRepository = {
  findByCode(code: string): Promise<RoomSnapshot | null>;
  findByCreationRequestId(creationRequestId: string): Promise<RoomSnapshot | null>;
  tryCreate(code: string, creationRequestId: string): Promise<RoomSnapshot | null>;
};

export type RoomServiceOptions = {
  clock?: Clock;
  generateCode?: () => string;
  maxCreateAttempts?: number;
};

export class RoomService {
  private readonly clock: Clock;
  private readonly generateCode: () => string;
  private readonly maxCreateAttempts: number;

  constructor(
    private readonly repository: RoomRepository,
    options: RoomServiceOptions = {},
  ) {
    this.clock = options.clock ?? new SystemClock();
    this.generateCode = options.generateCode ?? generateRoomCode;
    this.maxCreateAttempts = options.maxCreateAttempts ?? ROOM_CREATE_MAX_ATTEMPTS;
  }

  isRoomAvailable(room: RoomSnapshot | null): room is RoomSnapshot {
    return room !== null && room.status !== "closed" && room.expiresAt.getTime() > this.clock.now().getTime();
  }

  async findAvailableRoom(roomCode: string): Promise<RoomSnapshot | null> {
    const normalizedCode = normalizeRoomCode(roomCode);

    if (!normalizedCode) {
      return null;
    }

    const room = await this.repository.findByCode(normalizedCode);

    return this.isRoomAvailable(room) ? room : null;
  }

  async createRoom(creationRequestId: string): Promise<RoomSnapshot> {
    for (let attempt = 0; attempt < this.maxCreateAttempts; attempt += 1) {
      const generatedCode = normalizeRoomCode(this.generateCode());

      if (!generatedCode) {
        throw new Error("The room code generator returned an invalid code.");
      }

      const room = await this.repository.tryCreate(generatedCode, creationRequestId);

      if (room) {
        if (this.isRoomAvailable(room)) {
          return room;
        }

        throw new RoomCreationRequestUnavailableError();
      }
    }

    throw new RoomCreationAttemptsExhaustedError();
  }

  async resolveOrCreateRoom(savedRoomCode: string | null, creationRequestId: string): Promise<RoomSnapshot> {
    const room = savedRoomCode === null ? null : await this.findAvailableRoom(savedRoomCode);

    if (room) {
      return room;
    }

    const requestedRoom = await this.repository.findByCreationRequestId(creationRequestId);

    if (requestedRoom) {
      if (this.isRoomAvailable(requestedRoom)) {
        return requestedRoom;
      }

      throw new RoomCreationRequestUnavailableError();
    }

    return this.createRoom(creationRequestId);
  }
}
