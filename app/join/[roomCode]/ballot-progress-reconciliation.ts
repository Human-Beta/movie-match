import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { ParticipantClientSnapshot, PublicBallotProgress } from "@/lib/participants/public-participant-snapshot";

export type LocalBallotProgressProjection = {
  roundId: string;
  snapshot: ParticipantClientSnapshot;
  snapshotEpoch: number;
  progress: PublicBallotProgress;
};

function isSubmittedCount(submittedCount: number, totalParticipants: number): boolean {
  return Number.isInteger(submittedCount) && submittedCount >= 0 && submittedCount <= totalParticipants;
}

export function createLocalBallotProgressProjection({
  roundId,
  snapshot,
  snapshotEpoch,
  submittedCount,
}: Readonly<{
  roundId: string;
  snapshot: ParticipantClientSnapshot;
  snapshotEpoch: number;
  submittedCount: number;
}>): LocalBallotProgressProjection | null {
  const round = snapshot.currentRound;
  const progress = snapshot.ballotProgress;

  if (
    snapshot.roomState !== "playing" ||
    round?.status !== ROUND_STATUS.VOTING ||
    round.roundId !== roundId ||
    progress === null ||
    !isSubmittedCount(submittedCount, progress.totalParticipants)
  ) {
    return null;
  }

  return {
    roundId,
    snapshot,
    snapshotEpoch,
    progress: {
      ...progress,
      submittedCount,
      readyForResults: submittedCount === progress.totalParticipants,
    },
  };
}

export function reconcileBallotProgress({
  projection,
  snapshot,
  snapshotEpoch,
  snapshotReadFailed,
}: Readonly<{
  projection: LocalBallotProgressProjection | null;
  snapshot: ParticipantClientSnapshot;
  snapshotEpoch: number;
  snapshotReadFailed: boolean;
}>): PublicBallotProgress | null {
  if (
    snapshotReadFailed ||
    projection === null ||
    projection.snapshot !== snapshot ||
    projection.snapshotEpoch !== snapshotEpoch ||
    projection.roundId !== snapshot.currentRound?.roundId
  ) {
    return snapshot.ballotProgress;
  }

  return projection.progress;
}
