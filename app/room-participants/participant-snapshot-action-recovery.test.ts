import assert from "node:assert/strict";
import test from "node:test";

import {
  createParticipantSnapshotActionRecovery,
  PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY,
  type ParticipantSnapshotActionRecovery,
  type ParticipantSnapshotActionRecoveryStorage,
} from "@/app/room-participants/participant-snapshot-action-recovery";

class FakeStorage implements ParticipantSnapshotActionRecoveryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("reloads at most once for a stale Server Action and rearms after a working response", () => {
  const staleActionError = new Error("stale action reference");
  const storage = new FakeStorage();
  let reloads = 0;
  const createRecovery = (): ParticipantSnapshotActionRecovery =>
    createParticipantSnapshotActionRecovery({
      isUnrecognizedActionError: error => error === staleActionError,
      reload: () => {
        reloads += 1;
      },
      storage,
    });

  assert.equal(createRecovery().handleRejectedAction(new Error("ordinary outage")), false);
  const originalAssets = createRecovery();
  assert.equal(originalAssets.handleRejectedAction(staleActionError), true);
  assert.equal(reloads, 1);
  assert.equal(storage.getItem(PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY), "1");

  const reloadedAssets = createRecovery();
  assert.equal(reloadedAssets.handleRejectedAction(staleActionError), false);
  reloadedAssets.markActionAvailable();
  assert.equal(storage.getItem(PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY), null);
});
