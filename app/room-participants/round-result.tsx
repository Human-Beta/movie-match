"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { getVoteEmoji } from "@/app/room-participants/vote-emoji";
import { getNoMatchMessageKey } from "@/lib/game-rounds/no-match-message";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

export function RoundResult({ round }: Readonly<{ round: PublicRoomRound }>): ReactNode {
  const t = useTranslations("RoundResult");
  const tParticipantRole = useTranslations("Common.participantRole");
  const result = round.result;

  if (result === undefined) {
    return null;
  }

  return (
    <section aria-live="polite" aria-labelledby="round-result-title" className="mt-8 rounded-3xl bg-slate-900 p-6 ring-1 ring-white/10">
      <p className="text-sm font-semibold tracking-[0.2em] text-amber-400 uppercase">{t("label")}</p>
      <h2 className="mt-2 text-3xl font-bold" id="round-result-title">
        {result.status === ROUND_STATUS.MATCHED ? t("matchedTitle") : t("noMatchTitle")}
      </h2>
      <p className="mt-3 text-slate-300">
        {result.status === ROUND_STATUS.MATCHED ? t("matchedDescription") : t(getNoMatchMessageKey(round.roundId))}
      </p>
      <ul className="mt-6 space-y-3">
        {round.movies.map(movie => {
          const movieVotes = result.movieVotes.find(candidate => candidate.movieId === movie.movieId);
          const isSelected = result.selectedMovieId === movie.movieId;

          if (movieVotes === undefined) {
            return null;
          }

          return (
            <li
              className={
                isSelected
                  ? "rounded-2xl border border-emerald-300/40 bg-emerald-950/40 p-4 shadow-[0_0_28px_rgba(52,211,153,0.24)] ring-1 ring-emerald-300/25"
                  : "rounded-2xl bg-slate-950/60 p-4"
              }
              key={movie.movieId}
            >
              <p className="font-semibold text-white">
                {movie.title}
                {isSelected ? <span className="ml-2 text-emerald-200">{t("selected")}</span> : null}
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {movieVotes.votes.map(vote => (
                  <span className="mr-4 inline-block" key={vote.role}>
                    {vote.role === "host" ? tParticipantRole("host") : tParticipantRole("guest")}: {getVoteEmoji(vote.value)}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
      {result.status === ROUND_STATUS.NO_MATCH ? <p className="mt-6 text-lg font-semibold text-white">{t("nextQuestion")}</p> : null}
    </section>
  );
}
