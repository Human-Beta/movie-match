"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useVotingBallot, type BallotFeedback } from "@/app/join/[roomCode]/use-voting-ballot";
import {
  createLocalBallotProgressProjection,
  reconcileBallotProgress,
  type LocalBallotProgressProjection,
} from "@/app/join/[roomCode]/ballot-progress-reconciliation";
import { MovieCards } from "@/app/room-participants/movie-cards";
import { getVoteEmoji } from "@/app/room-participants/vote-emoji";
import { PrimaryButton } from "@/app/ui/primary-button";
import type { VoteValue } from "@/lib/ballots/ballot-vote";
import type {
  ParticipantClientSnapshot,
  ParticipantOwnBallot,
  PublicBallotProgress,
  PublicRoomMovie,
  PublicRoomRound,
} from "@/lib/participants/public-participant-snapshot";

const VOTING_NAMESPACE = "Voting";

const voteOptions: ReadonlyArray<{ value: VoteValue; label: "wantToWatch" | "couldWatch" | "notNow" | "no" }> = [
  { value: "want_to_watch", label: "wantToWatch" },
  { value: "could_watch", label: "couldWatch" },
  { value: "not_now", label: "notNow" },
  { value: "no", label: "no" },
];

export function VotingBallot({
  roomCode,
  round,
  ownBallot,
  snapshot,
  snapshotEpoch,
  snapshotReadFailed,
}: Readonly<{
  roomCode: string;
  round: PublicRoomRound;
  ownBallot: ParticipantOwnBallot | null;
  snapshot: ParticipantClientSnapshot;
  snapshotEpoch: number;
  snapshotReadFailed: boolean;
}>): ReactNode {
  const t = useTranslations(VOTING_NAMESPACE);
  const { progress, recordSubmittedProgress } = useBallotProgressReconciliation({ snapshot, snapshotEpoch, snapshotReadFailed });
  const { feedback, hasPendingBallot, immutable, selections, select, storageReady, submit, submitting } = useVotingBallot({
    onSubmitted: recordSubmittedProgress,
    ownBallot,
    roomCode,
    round,
  });
  const readyForResults = progress?.readyForResults === true;

  let submitLabel = t("submit");
  if (hasPendingBallot) {
    submitLabel = t("retry");
  }
  if (submitting) {
    submitLabel = t("submitting");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <p className="mb-3 text-lg font-semibold text-white">{t("title")}</p>
        <p className="mb-6 text-slate-300 sm:mb-8">{t("description")}</p>
        <MovieCards
          compactOnNarrow
          round={round}
          renderFooter={movie => (
            <VoteOptions
              disabled={immutable || submitting || hasPendingBallot}
              movie={movie}
              selected={selections[movie.movieId]}
              onSelect={select}
            />
          )}
        />
        <section className="mt-8 rounded-3xl bg-slate-900 p-6 ring-1 ring-white/10" aria-live="polite">
          {readyForResults ? (
            <p className="font-semibold text-emerald-200" role="status">
              {t("readyForResults")}
            </p>
          ) : (
            <p className="text-slate-300">{t("progress", { submitted: progress?.submittedCount ?? 0, total: progress?.totalParticipants ?? 2 })}</p>
          )}
          {feedback === "idle" ? null : <BallotFeedbackMessage feedback={feedback} />}
          <PrimaryButton
            busy={submitting}
            className="mt-5 w-full"
            disabled={!storageReady || immutable || submitting || feedback === "storage" || readyForResults}
            onClick={submit}
          >
            {immutable ? t("submittedButton") : submitLabel}
          </PrimaryButton>
        </section>
      </div>
    </main>
  );
}

function useBallotProgressReconciliation({
  snapshot,
  snapshotEpoch,
  snapshotReadFailed,
}: Readonly<{
  snapshot: ParticipantClientSnapshot;
  snapshotEpoch: number;
  snapshotReadFailed: boolean;
}>): {
  progress: PublicBallotProgress | null;
  recordSubmittedProgress(roundId: string, submittedCount: number): void;
} {
  const [projection, setProjection] = useState<LocalBallotProgressProjection | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return (): void => {
      mountedRef.current = false;
    };
  }, []);

  const recordSubmittedProgress = useCallback(
    (roundId: string, submittedCount: number): void => {
      if (!mountedRef.current || snapshotReadFailed) {
        return;
      }

      const nextProjection = createLocalBallotProgressProjection({ roundId, snapshot, snapshotEpoch, submittedCount });

      if (nextProjection !== null) {
        setProjection(nextProjection);
      }
    },
    [snapshot, snapshotEpoch, snapshotReadFailed],
  );

  return {
    progress: reconcileBallotProgress({ projection, snapshot, snapshotEpoch, snapshotReadFailed }),
    recordSubmittedProgress,
  };
}

function VoteOptions({
  disabled,
  movie,
  selected,
  onSelect,
}: Readonly<{
  disabled: boolean;
  movie: PublicRoomMovie;
  selected: VoteValue | undefined;
  onSelect(movieId: number, value: VoteValue): void;
}>): ReactNode {
  const t = useTranslations(VOTING_NAMESPACE);

  return (
    <fieldset className="grid grid-cols-2 gap-2" disabled={disabled}>
      <legend className="sr-only">{t("selectionLabel", { title: movie.title })}</legend>
      {voteOptions.map(option => (
        <label
          className={`flex min-h-12 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-xs leading-tight font-semibold transition sm:px-3 sm:text-sm ${
            disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
          } ${
            selected === option.value
              ? "border-amber-300 bg-amber-400 text-slate-950"
              : disabled
                ? "border-white/15 bg-slate-950 text-slate-100"
                : "border-white/15 bg-slate-950 text-slate-100 hover:border-white/40"
          }`}
          key={option.value}
        >
          <input
            checked={selected === option.value}
            className="sr-only"
            name={`vote-${movie.movieId}`}
            onChange={() => {
              onSelect(movie.movieId, option.value);
            }}
            type="radio"
            value={option.value}
          />
          <span aria-hidden="true">{getVoteEmoji(option.value)} </span>
          {t(option.label)}
        </label>
      ))}
    </fieldset>
  );
}

function BallotFeedbackMessage({ feedback }: Readonly<{ feedback: Exclude<BallotFeedback, "idle"> }>): ReactNode {
  const t = useTranslations(VOTING_NAMESPACE);
  const success = feedback === "submitted";

  return (
    <p
      className={`mt-4 rounded-xl p-4 text-sm leading-6 ring-1 ${
        success ? "bg-emerald-950/60 text-emerald-200 ring-emerald-400/20" : "bg-rose-950/60 text-rose-200 ring-rose-400/20"
      }`}
      role={success ? "status" : "alert"}
    >
      {t(`feedback.${feedback}`)}
    </p>
  );
}
