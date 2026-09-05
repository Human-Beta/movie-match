export const PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY = "movie-match:participant-action-recovery";

export type ParticipantSnapshotActionRecoveryStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type ParticipantSnapshotActionRecovery = {
  handleRejectedAction(error: unknown): boolean;
  markActionAvailable(): void;
};

export type ParticipantSnapshotActionRecoveryOptions = {
  isUnrecognizedActionError: (error: unknown) => boolean;
  reload: () => void;
  storage: ParticipantSnapshotActionRecoveryStorage;
};

export function createParticipantSnapshotActionRecovery({
  isUnrecognizedActionError,
  reload,
  storage,
}: ParticipantSnapshotActionRecoveryOptions): ParticipantSnapshotActionRecovery {
  let reloadRequested = false;

  return {
    handleRejectedAction(error: unknown): boolean {
      if (!isUnrecognizedActionError(error) || reloadRequested) {
        return false;
      }

      try {
        if (storage.getItem(PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY) !== null) {
          return false;
        }

        storage.setItem(PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY, "1");
      } catch {
        return false;
      }

      reloadRequested = true;

      try {
        reload();
        return true;
      } catch {
        reloadRequested = false;

        try {
          storage.removeItem(PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY);
        } catch {
          // The ordinary refresh fallback remains active when storage is unavailable.
        }

        return false;
      }
    },

    markActionAvailable(): void {
      reloadRequested = false;

      try {
        storage.removeItem(PARTICIPANT_ACTION_RECOVERY_STORAGE_KEY);
      } catch {
        // A fulfilled action already proves that the current reference works.
      }
    },
  };
}
