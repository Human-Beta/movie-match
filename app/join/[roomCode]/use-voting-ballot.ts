"use client";

import { useEffect, useRef, useState, useTransition, type Dispatch, type SetStateAction } from "react";

import { submitBallotAction, type PublicBallotSubmissionResult } from "@/app/join/[roomCode]/ballot-actions";
import { BallotRequestStorage, type PendingBallot } from "@/app/join/[roomCode]/ballot-request-storage";
import { assertNever } from "@/lib/assert-never";
import type { BallotVoteInput, VoteValue } from "@/lib/ballots/ballot-vote";
import type { ParticipantOwnBallot, PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

export type BallotFeedback = "idle" | "incomplete" | "retry" | "storage" | "submitted" | "unavailable" | "validation_error" | "conflict";
export type VoteSelections = Readonly<Record<number, VoteValue | undefined>>;

type VotingBallotController = {
  feedback: BallotFeedback;
  hasPendingBallot: boolean;
  immutable: boolean;
  selections: VoteSelections;
  select(movieId: number, value: VoteValue): void;
  storageReady: boolean;
  submit(): void;
  submitting: boolean;
};

type RestoredBallotState = {
  feedback: BallotFeedback;
  ownBallotStatus: ParticipantOwnBallot["status"] | null;
  pendingBallot: PendingBallot | null;
  selections: VoteSelections;
  setFeedback: Dispatch<SetStateAction<BallotFeedback>>;
  setPendingBallot: Dispatch<SetStateAction<PendingBallot | null>>;
  setSelections: Dispatch<SetStateAction<VoteSelections>>;
  storageReady: boolean;
};

function toSelections(votes: readonly BallotVoteInput[]): VoteSelections {
  return Object.fromEntries(votes.map(vote => [vote.movieId, vote.value]));
}

function selectedVotes(round: PublicRoomRound, selections: VoteSelections): BallotVoteInput[] | null {
  const votes = round.movies.map(movie => {
    const value = selections[movie.movieId];

    return value === undefined ? null : { movieId: movie.movieId, value };
  });

  return votes.every(vote => vote !== null) ? votes : null;
}

function restoredFeedback(ownBallotStatus: ParticipantOwnBallot["status"] | null, stored: PendingBallot | null): BallotFeedback {
  if (ownBallotStatus === "submitted") {
    return "submitted";
  }

  return stored === null ? "idle" : "retry";
}

function useRestoredBallotState({
  ownBallot,
  roomCode,
  roundId,
}: Readonly<{
  ownBallot: ParticipantOwnBallot | null;
  roomCode: string;
  roundId: string;
}>): RestoredBallotState {
  const [selections, setSelections] = useState<VoteSelections>({});
  const [pendingBallot, setPendingBallot] = useState<PendingBallot | null>(null);
  const [feedback, setFeedback] = useState<BallotFeedback>("idle");
  const [storageReady, setStorageReady] = useState(false);
  const ownBallotStatus = ownBallot?.status ?? null;
  const ownSubmittedVotes = ownBallot?.status === "submitted" ? ownBallot.votes : null;

  useEffect(() => {
    let mounted = true;

    try {
      const storage = new BallotRequestStorage(window.sessionStorage, roomCode, roundId);
      const stored = storage.read();
      const ownVotes = ownSubmittedVotes ?? [];
      const restoredSelections = ownBallotStatus === "submitted" ? toSelections(ownVotes) : toSelections(stored?.votes ?? []);
      const initialFeedback = restoredFeedback(ownBallotStatus, stored);

      queueMicrotask(() => {
        if (!mounted) {
          return;
        }

        setSelections(restoredSelections);
        setPendingBallot(stored);
        setFeedback(initialFeedback);
        setStorageReady(true);

        if (ownBallotStatus === "submitted" && stored !== null) {
          storage.clear(stored.requestId);
          setPendingBallot(null);
        }
      });
    } catch {
      queueMicrotask(() => {
        if (mounted) {
          setFeedback("storage");
        }
      });
    }

    return (): void => {
      mounted = false;
    };
  }, [ownBallotStatus, ownSubmittedVotes, roomCode, roundId]);

  return {
    feedback,
    ownBallotStatus,
    pendingBallot,
    selections,
    setFeedback,
    setPendingBallot,
    setSelections,
    storageReady,
  };
}

export function useVotingBallot({
  ownBallot,
  roomCode,
  round,
}: Readonly<{
  ownBallot: ParticipantOwnBallot | null;
  roomCode: string;
  round: PublicRoomRound;
}>): VotingBallotController {
  const { feedback, ownBallotStatus, pendingBallot, selections, setFeedback, setPendingBallot, setSelections, storageReady } = useRestoredBallotState(
    { ownBallot, roomCode, roundId: round.roundId },
  );
  const [submitting, startSubmitting] = useTransition();
  const submittingRef = useRef(false);

  const immutable = ownBallotStatus === "submitted" || feedback === "submitted";
  const completeVotes = selectedVotes(round, selections);

  function select(movieId: number, value: VoteValue): void {
    if (immutable || submitting || pendingBallot !== null) {
      return;
    }

    setSelections(current => ({ ...current, [movieId]: value }));
    setFeedback("idle");
  }

  function applyResult(result: Exclude<PublicBallotSubmissionResult, { status: "error" }>): void {
    switch (result.status) {
      case "submitted":
      case "unavailable":
      case "validation_error":
      case "conflict":
        setFeedback(result.status);
        return;
      default:
        return assertNever(result);
    }
  }

  function submit(): void {
    if (submittingRef.current || immutable) {
      return;
    }

    if (completeVotes === null) {
      setFeedback("incomplete");
      return;
    }

    submittingRef.current = true;
    startSubmitting(async () => {
      const storage = new BallotRequestStorage(window.sessionStorage, roomCode, round.roundId);
      let request: PendingBallot;

      try {
        request = pendingBallot ?? { requestId: crypto.randomUUID(), votes: completeVotes };
        storage.persist(request);
        setPendingBallot(request);
      } catch {
        setFeedback("storage");
        submittingRef.current = false;
        return;
      }

      try {
        const result = await submitBallotAction({ roomCode, roundId: round.roundId, requestId: request.requestId, votes: request.votes });

        if (result.status === "error") {
          setFeedback("retry");
          return;
        }

        storage.clear(request.requestId);
        setPendingBallot(null);
        applyResult(result);
      } catch {
        setFeedback("retry");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return {
    feedback,
    hasPendingBallot: pendingBallot !== null,
    immutable,
    selections,
    select,
    storageReady,
    submit,
    submitting,
  };
}
