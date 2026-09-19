"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { PublicParticipantIdentity } from "@/app/join/[roomCode]/join-action-state";
import { HostFilters } from "@/app/join/[roomCode]/host-filters";
import { RestartListControl } from "@/app/join/[roomCode]/restart-list-control";
import { getParticipantRoomView } from "@/app/room-participants/participant-room-view";
import { MovieCards } from "@/app/room-participants/movie-cards";
import { RoundResult } from "@/app/room-participants/round-result";
import { useAuthenticatedParticipantRoomSnapshot } from "@/app/room-participants/use-authenticated-participant-room-snapshot";
import { VotingBallot } from "@/app/join/[roomCode]/voting-ballot";
import { assertNever } from "@/lib/assert-never";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { ParticipantClientRoomState } from "@/lib/participants/public-participant-snapshot";

function PageShell({ children, wide = false }: Readonly<{ children: ReactNode; wide?: boolean }>): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-50">
      <section
        className={`w-full rounded-3xl bg-slate-900 p-7 shadow-2xl ring-1 shadow-black/20 ring-white/10 sm:p-10 ${wide ? "max-w-5xl" : "max-w-lg"}`}
      >
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        {children}
      </section>
    </main>
  );
}

export function UnavailableRoomState(): ReactNode {
  const t = useTranslations("JoinRoom");

  return (
    <PageShell>
      <h1 className="text-3xl font-bold tracking-tight">{t("status.unavailableTitle")}</h1>
      <p className="mt-4 text-lg leading-8 text-slate-300">{t("status.unavailableDescription")}</p>
    </PageShell>
  );
}

export function FullRoomState(): ReactNode {
  const t = useTranslations("JoinRoom");

  return (
    <PageShell>
      <h1 className="text-3xl font-bold tracking-tight">{t("status.fullTitle")}</h1>
      <p className="mt-4 text-lg leading-8 text-slate-300">{t("status.fullDescription")}</p>
    </PageShell>
  );
}

export function JoinedRoomState({
  roomCode,
  participant,
  room,
}: Readonly<{
  roomCode: string;
  participant: PublicParticipantIdentity;
  room: ParticipantClientRoomState;
}>): ReactNode {
  const t = useTranslations("JoinRoom");
  const tParticipantRole = useTranslations("Common.participantRole");
  const { snapshot, snapshotEpoch, snapshotReadFailed } = useAuthenticatedParticipantRoomSnapshot({
    initialSnapshot: room.snapshot,
    realtimeTopic: room.realtimeTopic,
    roomCode,
  });
  const roomView = getParticipantRoomView(snapshot);

  let statusMessage: string;

  switch (roomView) {
    case "unavailable":
      return <UnavailableRoomState />;
    case "waiting":
      statusMessage = t("status.waiting");
      break;
    case "ready":
      statusMessage = participant.role === "host" ? t("status.hostReady") : t("status.ready");
      break;
    case "playing":
      if (snapshot.currentRound === null) {
        statusMessage = t("status.roundLoading");
        break;
      }

      return snapshot.currentRound.status === ROUND_STATUS.VOTING ? (
        <VotingBallot
          ownBallot={snapshot.ownBallot}
          roomCode={roomCode}
          round={snapshot.currentRound}
          snapshot={snapshot}
          snapshotEpoch={snapshotEpoch}
          snapshotReadFailed={snapshotReadFailed}
        />
      ) : (
        <PageShell>
          <p className="text-slate-300">{t("status.advanced")}</p>
        </PageShell>
      );
    case "result":
      if (snapshot.currentRound === null) {
        return <UnavailableRoomState />;
      }

      return (
        <PageShell wide>
          <MovieCards round={snapshot.currentRound} />
          <RoundResult round={snapshot.currentRound} />
        </PageShell>
      );
    case "exhausted":
      return (
        <PageShell>
          <h1 className="text-3xl font-bold tracking-tight">{t("status.exhaustedTitle")}</h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">{t("status.exhaustedDescription")}</p>
          {participant.role === "host" ? <RestartListControl roomCode={roomCode} /> : null}
        </PageShell>
      );
    case "advanced":
      statusMessage = t("status.advanced");
      break;
    default:
      return assertNever(roomView);
  }

  const roleLabel = participant.role === "host" ? tParticipantRole("host") : tParticipantRole("guest");

  return (
    <PageShell>
      <div aria-live="polite">
        <p className="text-sm font-semibold tracking-[0.2em] text-emerald-400 uppercase">{t("status.joinedLabel")}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight break-words">{participant.name}</h1>
        <p className="mt-3 text-lg text-slate-300">
          {t("role.label")} <span className="font-semibold text-white">{roleLabel}</span>
        </p>
        <p className="mt-8 rounded-2xl bg-slate-950/60 p-5 leading-7 text-slate-300 ring-1 ring-white/10">{statusMessage}</p>
      </div>
      {participant.role === "host" && snapshot.roomState === "waiting" ? (
        <HostFilters participantCount={snapshot.participantCount} roomCode={roomCode} />
      ) : null}
    </PageShell>
  );
}
