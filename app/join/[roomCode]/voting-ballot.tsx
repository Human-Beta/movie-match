"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useVotingBallot, type BallotFeedback } from "@/app/join/[roomCode]/use-voting-ballot";
import { MovieCards } from "@/app/room-participants/movie-cards";
import { getVoteEmoji } from "@/app/room-participants/vote-emoji";
import { PrimaryButton } from "@/app/ui/primary-button";
import type { VoteValue } from "@/lib/ballots/ballot-vote";
import type { ParticipantOwnBallot, PublicBallotProgress, PublicRoomMovie, PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

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
  progress,
}: Readonly<{
  roomCode: string;
  round: PublicRoomRound;
  ownBallot: ParticipantOwnBallot | null;
  progress: PublicBallotProgress | null;
}>): ReactNode {
  const t = useTranslations(VOTING_NAMESPACE);
  const { feedback, hasPendingBallot, immutable, selections, select, storageReady, submit, submitting } = useVotingBallot({
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
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <p className="mb-3 text-lg font-semibold text-white">{t("title")}</p>
        <p className="mb-8 text-slate-300">{t("description")}</p>
        <MovieCards
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
          className={`flex min-h-12 cursor-pointer items-center justify-center gap-1 rounded-xl border px-3 py-2 text-center text-sm leading-tight font-semibold transition disabled:cursor-not-allowed ${
            selected === option.value
              ? "border-amber-300 bg-amber-400 text-slate-950"
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
