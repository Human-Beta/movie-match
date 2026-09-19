"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { getParticipantRoomView } from "@/app/room-participants/participant-room-view";
import type { ParticipantRealtimeTransportStatus } from "@/app/room-participants/room-participant-sync";
import { MovieCards } from "@/app/room-participants/movie-cards";
import { useRoomParticipantSnapshot } from "@/app/room-participants/use-room-participant-snapshot";
import { JoinQrCode } from "@/app/tv/[roomCode]/join-qr-code";
import { NewRoomLink } from "@/app/tv/[roomCode]/new-room-link";
import { TvRoundResultTransition } from "@/app/tv/[roomCode]/tv-round-result-transition";
import { assertNever } from "@/lib/assert-never";
import { isTerminalRoundStatus, ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

type TransportPresentation = {
  dotClassName: string;
  label: string;
};

const TV_ROOM_NAMESPACE = "TvRoom";

function getTransportPresentation(
  status: ParticipantRealtimeTransportStatus,
  labels: Readonly<Record<ParticipantRealtimeTransportStatus, string>>,
): TransportPresentation {
  switch (status) {
    case "connecting":
      return { dotClassName: "bg-amber-400", label: labels.connecting };
    case "connected":
      return { dotClassName: "bg-emerald-400", label: labels.connected };
    case "disconnected":
      return { dotClassName: "bg-rose-400", label: labels.disconnected };
    default:
      return assertNever(status);
  }
}

export function TvUnavailableRoom(): ReactNode {
  const t = useTranslations(TV_ROOM_NAMESPACE);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="max-w-xl text-center">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <h1 className="text-4xl font-bold tracking-tight">{t("error.unavailableTitle")}</h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">{t("error.unavailableDescription")}</p>
        <NewRoomLink />
      </section>
    </main>
  );
}

function TvAdvancedRoom(): ReactNode {
  const t = useTranslations(TV_ROOM_NAMESPACE);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="max-w-xl text-center">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <h1 className="text-4xl font-bold tracking-tight">{t("participants.advancedTitle")}</h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">{t("participants.advancedDescription")}</p>
      </section>
    </main>
  );
}

function TvPlayingRoom({ snapshot }: Readonly<{ snapshot: PublicParticipantSnapshot }>): ReactNode {
  const t = useTranslations(TV_ROOM_NAMESPACE);
  const [noMatchTransitionCompleteKey, setNoMatchTransitionCompleteKey] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        {snapshot.currentRound === null ? (
          <p className="text-lg text-slate-300" role="status">
            {t("game.loading")}
          </p>
        ) : (
          <>
            {isTerminalRoundStatus(snapshot.currentRound.status) ? (
              <TvRoundResultTransition
                key={`${snapshot.currentRound.roundId}:${snapshot.currentRound.status}`}
                onNoMatchTransitionComplete={setNoMatchTransitionCompleteKey}
                round={snapshot.currentRound}
              />
            ) : (
              <MovieCards round={snapshot.currentRound} />
            )}
            {snapshot.currentRound.status === ROUND_STATUS.VOTING && snapshot.ballotProgress !== null ? (
              <p className="mt-8 rounded-2xl bg-slate-900 p-5 text-lg text-slate-200 ring-1 ring-white/10" role="status">
                {snapshot.ballotProgress.readyForResults
                  ? t("game.readyForResults")
                  : t("game.votingProgress", {
                      submitted: snapshot.ballotProgress.submittedCount,
                      total: snapshot.ballotProgress.totalParticipants,
                    })}
              </p>
            ) : null}
            {noMatchTransitionCompleteKey === `${snapshot.currentRound.roundId}:${ROUND_STATUS.NO_MATCH}` ? (
              <span className="sr-only">{t("game.noMatchTransitionComplete")}</span>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function TvExhaustedRoom(): ReactNode {
  const t = useTranslations(TV_ROOM_NAMESPACE);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="max-w-xl text-center">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <h1 className="text-4xl font-bold tracking-tight">{t("game.exhaustedTitle")}</h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">{t("game.exhaustedDescription")}</p>
      </section>
    </main>
  );
}

export function TvParticipantRoom({
  initialSnapshot,
  realtimeTopic,
  roomCode,
}: Readonly<{
  initialSnapshot: PublicParticipantSnapshot;
  realtimeTopic: string;
  roomCode: string;
}>): ReactNode {
  const t = useTranslations(TV_ROOM_NAMESPACE);
  const tParticipantRole = useTranslations("Common.participantRole");
  const { snapshot, transportStatus } = useRoomParticipantSnapshot({ initialSnapshot, realtimeTopic });
  const roomView = getParticipantRoomView(snapshot);
  const transportPresentation = getTransportPresentation(transportStatus, {
    connecting: t("connection.connecting"),
    connected: t("connection.connected"),
    disconnected: t("connection.disconnected"),
  });

  switch (roomView) {
    case "unavailable":
      return <TvUnavailableRoom />;
    case "advanced":
      return <TvAdvancedRoom />;
    case "playing":
    case "result":
      return <TvPlayingRoom snapshot={snapshot} />;
    case "exhausted":
      return <TvExhaustedRoom />;
    case "waiting":
    case "ready":
      break;
    default:
      return assertNever(roomView);
  }

  const waitingForParticipants = roomView === "waiting";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50 sm:py-16">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-12 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{waitingForParticipants ? t("join.title") : t("participants.readyTitle")}</h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            {waitingForParticipants ? t("join.description") : t("participants.readyDescription")}
          </p>
          <div className="mt-10">
            <p className="text-sm font-semibold tracking-[0.2em] text-slate-400 uppercase">{t("join.roomCodeLabel")}</p>
            <p className="mt-2 font-mono text-6xl font-black tracking-[0.16em] text-white sm:text-8xl">{roomCode}</p>
          </div>
          <div className="mt-10 rounded-3xl bg-slate-900 p-5 ring-1 ring-white/10" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-semibold text-white">{t("participants.count", { count: snapshot.participantCount })}</p>
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <span className={`h-2.5 w-2.5 rounded-full ${transportPresentation.dotClassName}`} aria-hidden="true" />
                {transportPresentation.label}
              </p>
            </div>
            {snapshot.participants.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {snapshot.participants.map(participant => (
                  <li className="flex min-w-0 items-center justify-between gap-4 rounded-2xl bg-slate-950/70 px-4 py-3" key={participant.role}>
                    <span className="min-w-0 text-lg font-semibold break-words">{participant.name}</span>
                    <span className="shrink-0 text-sm text-slate-400">
                      {participant.role === "host" ? tParticipantRole("host") : tParticipantRole("guest")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-slate-300">{t("participants.none")}</p>
            )}
          </div>
        </div>
        {waitingForParticipants ? (
          <JoinQrCode roomCode={roomCode} />
        ) : (
          <div className="rounded-3xl bg-slate-900 p-8 text-center ring-1 ring-white/10">
            <p className="text-6xl" aria-hidden="true">
              ✓
            </p>
            <p className="mt-4 text-xl font-semibold">{t("participants.readyCard")}</p>
          </div>
        )}
      </section>
    </main>
  );
}
