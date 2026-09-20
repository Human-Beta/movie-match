import assert from "node:assert/strict";
import test from "node:test";

import { createLocalBallotProgressProjection, reconcileBallotProgress } from "@/app/join/[roomCode]/ballot-progress-reconciliation";
import type { ParticipantClientSnapshot } from "@/lib/participants/public-participant-snapshot";

const roundId = "11111111-1111-4111-8111-111111111111";

function votingSnapshot(overrides: Partial<ParticipantClientSnapshot> = {}): ParticipantClientSnapshot {
  return {
    ballotProgress: { submittedCount: 0, totalParticipants: 2, readyForResults: false },
    currentRound: {
      movies: [
        { movieId: 1, position: 1, title: "Перший", posterPath: null, releaseYear: 2010, runtimeMinutes: 90, genres: [] },
        { movieId: 2, position: 2, title: "Другий", posterPath: null, releaseYear: 2011, runtimeMinutes: 100, genres: [] },
        { movieId: 3, position: 3, title: "Третій", posterPath: null, releaseYear: 2012, runtimeMinutes: 110, genres: [] },
      ],
      roundId,
      roundNumber: 1,
      status: "voting",
    },
    ownBallot: { status: "not_submitted", votes: [] },
    participantCount: 2,
    participants: [],
    roomState: "playing",
    ...overrides,
  };
}

test("projects a committed first ballot without waiting for a snapshot", () => {
  const snapshot = votingSnapshot();
  const projection = createLocalBallotProgressProjection({ roundId, snapshot, snapshotEpoch: 1, submittedCount: 1 });

  assert.deepEqual(reconcileBallotProgress({ projection, snapshot, snapshotEpoch: 1 }), {
    submittedCount: 1,
    totalParticipants: 2,
    readyForResults: false,
  });
});

test("shows only neutral result readiness for a committed second ballot", () => {
  const snapshot = votingSnapshot({ ballotProgress: { submittedCount: 1, totalParticipants: 2, readyForResults: false } });
  const projection = createLocalBallotProgressProjection({ roundId, snapshot, snapshotEpoch: 1, submittedCount: 2 });

  assert.deepEqual(reconcileBallotProgress({ projection, snapshot, snapshotEpoch: 1 }), {
    submittedCount: 2,
    totalParticipants: 2,
    readyForResults: true,
  });
});

test("replaces a local projection with the next authoritative snapshot", () => {
  const sourceSnapshot = votingSnapshot();
  const projection = createLocalBallotProgressProjection({ roundId, snapshot: sourceSnapshot, snapshotEpoch: 1, submittedCount: 2 });
  const authoritativeSnapshot = votingSnapshot({ ballotProgress: { submittedCount: 1, totalParticipants: 2, readyForResults: false } });

  assert.deepEqual(reconcileBallotProgress({ projection, snapshot: authoritativeSnapshot, snapshotEpoch: 2 }), {
    submittedCount: 1,
    totalParticipants: 2,
    readyForResults: false,
  });
});

test("ignores stale, altered, and rejected submit outcomes", () => {
  const currentSnapshot = votingSnapshot();
  const currentRound = currentSnapshot.currentRound;

  if (currentRound === null) {
    throw new Error("Expected voting snapshot to include a round.");
  }

  const nextRoundSnapshot = votingSnapshot({
    currentRound: { ...currentRound, roundId: "22222222-2222-4222-8222-222222222222", roundNumber: 2 },
  });

  assert.equal(createLocalBallotProgressProjection({ roundId, snapshot: nextRoundSnapshot, snapshotEpoch: 1, submittedCount: 1 }), null);
  assert.equal(createLocalBallotProgressProjection({ roundId, snapshot: votingSnapshot(), snapshotEpoch: 1, submittedCount: 3 }), null);
  assert.equal(createLocalBallotProgressProjection({ roundId, snapshot: votingSnapshot(), snapshotEpoch: 1, submittedCount: 1.5 }), null);
  assert.equal(createLocalBallotProgressProjection({ roundId, snapshot: votingSnapshot(), snapshotEpoch: 1, submittedCount: -1 }), null);
});

test("keeps an idempotent retry local only until snapshot invalidation", () => {
  const snapshot = votingSnapshot();
  const firstProjection = createLocalBallotProgressProjection({ roundId, snapshot, snapshotEpoch: 1, submittedCount: 1 });
  const retryProjection = createLocalBallotProgressProjection({ roundId, snapshot, snapshotEpoch: 1, submittedCount: 1 });

  assert.deepEqual(firstProjection?.progress, retryProjection?.progress);
  assert.deepEqual(reconcileBallotProgress({ projection: retryProjection, snapshot, snapshotEpoch: 2 }), snapshot.ballotProgress);
});

test("ignores a local projection after a realtime reconnect", () => {
  const snapshot = votingSnapshot();
  const projection = createLocalBallotProgressProjection({ roundId, snapshot, snapshotEpoch: 1, submittedCount: 1 });

  assert.deepEqual(reconcileBallotProgress({ projection, snapshot, snapshotEpoch: 2 }), snapshot.ballotProgress);
});
