import "server-only";

import { DrizzleRoomRepository } from "@/lib/rooms/room-repository";
import { RoomService, type RoomSnapshot } from "@/lib/rooms/room-service";

export { RoomCreationRequestUnavailableError } from "@/lib/rooms/errors";

const roomService = new RoomService(new DrizzleRoomRepository());

export function getAvailableRoom(roomCode: string): Promise<RoomSnapshot | null> {
  return roomService.findAvailableRoom(roomCode);
}

export function resolveTvRoom(savedRoomCode: string | null, creationRequestId: string): Promise<RoomSnapshot> {
  return roomService.resolveOrCreateRoom(savedRoomCode, creationRequestId);
}
