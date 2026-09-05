import { SystemClock, type Clock } from "@/lib/clock";
import type { JoinRoomInput } from "@/lib/participants/join-input";
import { hashParticipantAccessToken, hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import { normalizeRoomCode } from "@/lib/rooms/room-code";
import type { RoomStatus } from "@/lib/rooms/room-service";

export type ParticipantRole = "host" | "guest";

export type ParticipantIdentity = {
  id: string;
  name: string;
  role: ParticipantRole;
};

export type ParticipantRoom = {
  id: string;
  code: string;
  status: RoomStatus;
  expiresAt: Date;
};

export type ParticipantRoomSnapshot = {
  room: ParticipantRoom | null;
  participant: ParticipantIdentity | null;
  participantCount: number;
};

export type LockedParticipantRoom = {
  findParticipantByAccessTokenHash(accessTokenHash: string): Promise<ParticipantIdentity | null>;
  listParticipantRoles(): Promise<ParticipantRole[]>;
  createParticipant(input: { name: string; role: ParticipantRole; accessTokenHash: string }): Promise<ParticipantIdentity>;
};

export type ParticipantRepository = {
  inspectRoom(roomCode: string, accessTokenHash: string | null): Promise<ParticipantRoomSnapshot>;
  inLockedRoom<T>(roomCode: string, operation: (room: ParticipantRoom | null, lockedRoom: LockedParticipantRoom) => Promise<T>): Promise<T>;
};

export type ParticipantServiceOptions = {
  clock?: Clock;
};

export type JoinParticipantInput = JoinRoomInput & {
  joinRequestToken: string;
};

export type JoinRoomView =
  | { status: "form"; roomCode: string }
  | { status: "full" }
  | { status: "unavailable" }
  | { status: "joined"; roomId: string; participant: ParticipantIdentity };

export type JoinParticipantResult =
  | { status: "full" }
  | { status: "unavailable" }
  | {
      status: "joined";
      roomId: string;
      participant: ParticipantIdentity;
      participantCreated: boolean;
      newSession: { rawAccessToken: string; expiresAt: Date } | null;
    };

export class ParticipantService {
  private readonly clock: Clock;

  constructor(
    private readonly repository: ParticipantRepository,
    options: ParticipantServiceOptions = {},
  ) {
    this.clock = options.clock ?? new SystemClock();
  }

  async getJoinRequestExpiresAt(roomCode: string): Promise<Date | null> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      return null;
    }

    const snapshot = await this.repository.inspectRoom(normalizedRoomCode, null);
    const room = this.getOpenRoomForSession(snapshot.room);

    if (room?.status !== "waiting") {
      return null;
    }

    return room.expiresAt;
  }

  async getJoinRoomView(roomCode: string, storedAccessToken: string | null): Promise<JoinRoomView> {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      return { status: "unavailable" };
    }

    const accessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);
    const snapshot = await this.repository.inspectRoom(normalizedRoomCode, accessTokenHash);
    const room = this.getOpenRoomForSession(snapshot.room);

    if (room === null) {
      return { status: "unavailable" };
    }

    if (snapshot.participant) {
      return { status: "joined", roomId: room.id, participant: snapshot.participant };
    }

    if (room.status !== "waiting") {
      return { status: "unavailable" };
    }

    if (snapshot.participantCount >= 2) {
      return { status: "full" };
    }

    return { status: "form", roomCode: room.code };
  }

  async joinParticipant(input: JoinParticipantInput, storedAccessToken: string | null): Promise<JoinParticipantResult> {
    const existingAccessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);
    const joinRequestTokenHash = hashParticipantAccessToken(input.joinRequestToken);

    return this.repository.inLockedRoom(input.roomCode, async (room, lockedRoom): Promise<JoinParticipantResult> => {
      const openRoom = this.getOpenRoomForSession(room);

      if (openRoom === null) {
        return { status: "unavailable" };
      }

      if (existingAccessTokenHash) {
        const existingParticipant = await lockedRoom.findParticipantByAccessTokenHash(existingAccessTokenHash);

        if (existingParticipant) {
          return {
            status: "joined",
            roomId: openRoom.id,
            participant: existingParticipant,
            participantCreated: false,
            newSession: null,
          };
        }
      }

      const retriedParticipant = await lockedRoom.findParticipantByAccessTokenHash(joinRequestTokenHash);

      if (retriedParticipant) {
        return {
          status: "joined",
          roomId: openRoom.id,
          participant: retriedParticipant,
          participantCreated: false,
          newSession: {
            rawAccessToken: input.joinRequestToken,
            expiresAt: openRoom.expiresAt,
          },
        };
      }

      if (openRoom.status !== "waiting") {
        return { status: "unavailable" };
      }

      const occupiedRoles = await lockedRoom.listParticipantRoles();
      const role = this.getAvailableParticipantRole(occupiedRoles);

      if (!role) {
        return { status: "full" };
      }

      const participant = await lockedRoom.createParticipant({
        accessTokenHash: joinRequestTokenHash,
        name: input.name,
        role,
      });

      return {
        status: "joined",
        roomId: openRoom.id,
        participant,
        participantCreated: true,
        newSession: {
          rawAccessToken: input.joinRequestToken,
          expiresAt: openRoom.expiresAt,
        },
      };
    });
  }

  private getAvailableParticipantRole(occupiedRoles: ReadonlyArray<ParticipantRole>): ParticipantRole | null {
    if (!occupiedRoles.includes("host")) {
      return "host";
    }

    if (!occupiedRoles.includes("guest")) {
      return "guest";
    }

    return null;
  }

  private getOpenRoomForSession(room: ParticipantRoom | null): ParticipantRoom | null {
    if (room === null || room.status === "closed" || room.expiresAt.getTime() <= this.clock.now().getTime()) {
      return null;
    }

    return room;
  }
}
