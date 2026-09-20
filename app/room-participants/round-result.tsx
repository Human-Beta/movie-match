"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { MatchActionsSlot } from "@/app/room-participants/match-actions-slot";
import { getMatchPresentation } from "@/app/room-participants/match-presentation";
import { PostMatchControls } from "@/app/join/[roomCode]/post-match-controls";
import { getVoteEmoji } from "@/app/room-participants/vote-emoji";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { ParticipantRole } from "@/lib/participants/participant-service";
import type { PublicRoomRound, PublicRoundMovieVotes } from "@/lib/participants/public-participant-snapshot";

const VOTE_LABEL_KEY = {
  want_to_watch: "wantToWatch",
  could_watch: "couldWatch",
  not_now: "notNow",
  no: "no",
} as const;

export function RoundResult({
  participantRole,
  roomCode,
  round,
}: Readonly<{ participantRole: ParticipantRole; roomCode: string; round: PublicRoomRound }>): ReactNode {
  const t = useTranslations("RoundResult");
  const result = round.result;

  if (result === undefined) {
    return null;
  }

  if (result.status === ROUND_STATUS.MATCHED) {
    const match = getMatchPresentation(round);

    if (match === null) {
      return null;
    }

    return (
      <section aria-labelledby="match-result-title">
        <p className="text-sm font-semibold tracking-[0.2em] text-emerald-300 uppercase">{t("matchStatus")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight" id="match-result-title">
          {t("matchTitle")}
        </h1>
        <p className="mt-3 text-slate-300">{t(`finalMessages.${match.finalMessageKey}`)}</p>
        <article className="mt-6 rounded-2xl border border-emerald-300/40 bg-emerald-950/40 p-5 shadow-[0_0_28px_rgba(52,211,153,0.24)] ring-1 ring-emerald-300/25">
          <p className="text-sm font-semibold text-emerald-200" aria-label={t("selectedMovieLabel", { title: match.selectedMovie.title })}>
            {t("selected")}
          </p>
          <h2 className="mt-2 text-xl font-bold break-words text-white">{match.selectedMovie.title}</h2>
          <MovieVotes participantRole={participantRole} votes={match.selectedVotes} />
        </article>
        {participantRole === "guest" ? <p className="mt-6 text-slate-300">{t("guestWaiting")}</p> : null}
        <MatchActionsSlot participantRole={participantRole}>
          <PostMatchControls roomCode={roomCode} />
        </MatchActionsSlot>
      </section>
    );
  }

  return (
    <section aria-labelledby="round-result-title" className="mt-8 rounded-3xl bg-slate-900 p-6 ring-1 ring-white/10">
      <p className="text-sm font-semibold tracking-[0.2em] text-amber-400 uppercase">{t("label")}</p>
      <h2 className="mt-2 text-3xl font-bold" id="round-result-title">
        {t("noMatchTitle")}
      </h2>
      <p className="mt-3 text-slate-300">{t("noMatchDescription")}</p>
      <ul className="mt-6 space-y-3">
        {round.movies.map(movie => {
          const movieVotes = result.movieVotes.find(candidate => candidate.movieId === movie.movieId);

          if (movieVotes === undefined) {
            return null;
          }

          return (
            <li className="rounded-2xl bg-slate-950/60 p-4" key={movie.movieId}>
              <p className="font-semibold text-white">{movie.title}</p>
              <MovieVotes participantRole={participantRole} votes={movieVotes} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MovieVotes({ participantRole, votes }: Readonly<{ participantRole: ParticipantRole; votes: PublicRoundMovieVotes }>): ReactNode {
  const tParticipantRole = useTranslations("Common.participantRole");
  const tVoting = useTranslations("Voting");

  return (
    <dl className="mt-4 space-y-2 text-sm text-slate-200" aria-label={tVoting("revealedVotesLabel")}>
      {votes.votes.map(vote => {
        const role = vote.role === "host" ? tParticipantRole("host") : tParticipantRole("guest");
        const voteOwner = vote.role === participantRole ? tVoting("yourVote", { role }) : tVoting("partnerVote", { role });

        return (
          <div className="flex gap-2" key={vote.role}>
            <dt className="font-semibold">{voteOwner}:</dt>
            <dd aria-label={tVoting("revealedVote", { role: voteOwner, vote: tVoting(VOTE_LABEL_KEY[vote.value]) })}>
              <span aria-hidden="true">{getVoteEmoji(vote.value)}</span> {tVoting(VOTE_LABEL_KEY[vote.value])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
