import assert from "node:assert/strict";
import test from "node:test";

import { RoomCreationAttemptsExhaustedError, RoomCreationRequestUnavailableError } from "@/lib/rooms/errors";
import { RoomService, type Clock, type RoomRepository, type RoomServiceOptions, type RoomSnapshot, type RoomStatus } from "@/lib/rooms/room-service";

const now = new Date("2026-08-23T12:00:00.000Z");
const future = new Date("2026-08-23T13:00:00.000Z");
const creationRequestId = "0198db8f-1d4e-741d-a197-33e7ea830d5c";

type RoomRepositoryOverrides = Partial<RoomRepository>;

class FixedClock implements Clock {
  constructor(private readonly currentTime: Date) {}

  now(): Date {
    return this.currentTime;
  }
}

class TestRoomRepository implements RoomRepository {
  constructor(private readonly overrides: RoomRepositoryOverrides = {}) {}

  async findByCode(code: string): Promise<RoomSnapshot | null> {
    return this.overrides.findByCode ? this.overrides.findByCode(code) : null;
  }

  async findByCreationRequestId(requestId: string): Promise<RoomSnapshot | null> {
    return this.overrides.findByCreationRequestId ? this.overrides.findByCreationRequestId(requestId) : null;
  }

  async tryCreate(code: string, requestId: string): Promise<RoomSnapshot | null> {
    return this.overrides.tryCreate ? this.overrides.tryCreate(code, requestId) : null;
  }
}

function createRoomService(repository: RoomRepository = new TestRoomRepository(), options: RoomServiceOptions = {}): RoomService {
  return new RoomService(repository, {
    clock: new FixedClock(now),
    ...options,
  });
}

function makeRoom(code: string, status: RoomStatus = "waiting", expiresAt: Date = future): RoomSnapshot {
  return { code, status, expiresAt };
}

test("restores every unexpired room state except closed", () => {
  const service = createRoomService();

  for (const status of ["waiting", "playing", "matched", "exhausted"] satisfies RoomStatus[]) {
    assert.equal(service.isRoomAvailable(makeRoom("ABC123", status)), true);
  }

  assert.equal(service.isRoomAvailable(makeRoom("ABC123", "closed")), false);
  assert.equal(service.isRoomAvailable(makeRoom("ABC123", "waiting", now)), false);
  assert.equal(service.isRoomAvailable(makeRoom("ABC123", "waiting", new Date(now.getTime() - 1))), false);
});

test("uses production defaults when constructed with only a repository", async () => {
  const repository = new TestRoomRepository({
    async tryCreate(code): Promise<RoomSnapshot> {
      return makeRoom(code, "waiting", new Date("2100-01-01T00:00:00.000Z"));
    },
  });
  const service = new RoomService(repository);

  const room = await service.createRoom(creationRequestId);

  assert.match(room.code, /^[A-Z0-9]{6}$/);
});

test("restores a normalized available room without creating another row", async () => {
  const lookups: string[] = [];
  const repository = new TestRoomRepository({
    async findByCode(code): Promise<RoomSnapshot> {
      lookups.push(code);
      return makeRoom("AB12CD", "playing");
    },
    async tryCreate(): Promise<never> {
      throw new Error("create must not run while the saved room is available");
    },
    async findByCreationRequestId(): Promise<never> {
      throw new Error("creation request lookup must not run while the saved room is available");
    },
  });
  const service = createRoomService(repository, {
    generateCode: () => {
      throw new Error("generation must not run while restoring");
    },
  });

  const room = await service.resolveOrCreateRoom(" ab12cd ", creationRequestId);

  assert.equal(room.code, "AB12CD");
  assert.deepEqual(lookups, ["AB12CD"]);
});

test("replaces an unavailable saved room with one new room", async () => {
  const createdCodes: string[] = [];
  const repository = new TestRoomRepository({
    async findByCode(): Promise<RoomSnapshot> {
      return makeRoom("CLOSED", "closed");
    },
    async tryCreate(code): Promise<RoomSnapshot> {
      createdCodes.push(code);
      return makeRoom(code);
    },
  });
  const service = createRoomService(repository, {
    generateCode: () => "NEW123",
  });

  const room = await service.resolveOrCreateRoom("closed", creationRequestId);

  assert.equal(room.code, "NEW123");
  assert.deepEqual(createdCodes, ["NEW123"]);
});

test("retries bounded unique collisions and inserts only the successful code", async () => {
  const generatedCodes = ["AAAA11", "BBBB22", "CCCC33"];
  const attempts: string[] = [];
  const insertedRows: RoomSnapshot[] = [];
  const repository = new TestRoomRepository({
    async tryCreate(code): Promise<RoomSnapshot | null> {
      attempts.push(code);

      if (attempts.length < 3) {
        return null;
      }

      const room = makeRoom(code);
      insertedRows.push(room);
      return room;
    },
  });
  const service = createRoomService(repository, {
    generateCode: () => generatedCodes.shift() ?? "UNUSED",
    maxCreateAttempts: 3,
  });

  const room = await service.createRoom(creationRequestId);

  assert.equal(room.code, "CCCC33");
  assert.deepEqual(attempts, ["AAAA11", "BBBB22", "CCCC33"]);
  assert.deepEqual(insertedRows, [makeRoom("CCCC33")]);
});

test("stops after the configured collision retry bound", async () => {
  let attempts = 0;
  const repository = new TestRoomRepository({
    async tryCreate(): Promise<null> {
      attempts += 1;
      return null;
    },
  });
  const service = createRoomService(repository, {
    generateCode: () => "ABC123",
    maxCreateAttempts: 3,
  });

  await assert.rejects(service.createRoom(creationRequestId), RoomCreationAttemptsExhaustedError);
  assert.equal(attempts, 3);
});

test("restores the room created by a retried creation request", async () => {
  const repository = new TestRoomRepository({
    async findByCreationRequestId(requestId): Promise<RoomSnapshot> {
      assert.equal(requestId, creationRequestId);
      return makeRoom("SAME11");
    },
    async tryCreate(): Promise<never> {
      throw new Error("create must not run for a repeated creation request");
    },
  });
  const service = createRoomService(repository, {
    generateCode: () => {
      throw new Error("generation must not run for a repeated request");
    },
  });

  const room = await service.resolveOrCreateRoom(null, creationRequestId);

  assert.equal(room.code, "SAME11");
});

test("concurrent calls with one creation request return one room", async () => {
  let createdRoom: RoomSnapshot | null = null;
  let insertCount = 0;
  const repository = new TestRoomRepository({
    async findByCreationRequestId(): Promise<RoomSnapshot | null> {
      return createdRoom;
    },
    async tryCreate(code): Promise<RoomSnapshot> {
      if (!createdRoom) {
        insertCount += 1;
        createdRoom = makeRoom(code);
      }

      return createdRoom;
    },
  });
  const generatedCodes = ["FIRST1", "SECOND"];
  const service = createRoomService(repository, {
    generateCode: (): string => generatedCodes.shift() ?? "UNUSED",
  });

  const [firstRoom, secondRoom] = await Promise.all([
    service.resolveOrCreateRoom(null, creationRequestId),
    service.resolveOrCreateRoom(null, creationRequestId),
  ]);

  assert.equal(insertCount, 1);
  assert.equal(firstRoom.code, "FIRST1");
  assert.equal(secondRoom.code, "FIRST1");
});

test("rejects a creation request tied to an unavailable room", async () => {
  const repository = new TestRoomRepository({
    async findByCreationRequestId(): Promise<RoomSnapshot> {
      return makeRoom("OLD111", "waiting", now);
    },
    async tryCreate(): Promise<never> {
      throw new Error("create must not reuse an unavailable request");
    },
  });
  const service = createRoomService(repository, {
    generateCode: () => "NEW111",
  });

  await assert.rejects(service.resolveOrCreateRoom(null, creationRequestId), RoomCreationRequestUnavailableError);
});
