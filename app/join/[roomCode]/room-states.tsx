"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { PublicParticipantIdentity } from "@/app/join/[roomCode]/join-action-state";
import { getParticipantRoomView } from "@/app/room-participants/participant-room-view";
import { useRoomParticipantSnapshot } from "@/app/room-participants/use-room-participant-snapshot";
import { assertNever } from "@/lib/assert-never";
import type { ParticipantClientRoomState } from "@/lib/participants/public-participant-snapshot";

function PageShell({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-50">
      <section className="w-full max-w-lg rounded-3xl bg-slate-900 p-7 shadow-2xl ring-1 shadow-black/20 ring-white/10 sm:p-10">
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
  participant,
  room,
}: Readonly<{
  participant: PublicParticipantIdentity;
  room: ParticipantClientRoomState;
}>): ReactNode {
  const t = useTranslations("JoinRoom");
  const { snapshot } = useRoomParticipantSnapshot({
    initialSnapshot: room.snapshot,
    realtimeTopic: room.realtimeTopic,
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
      statusMessage = t("status.ready");
      break;
    case "advanced":
      statusMessage = t("status.advanced");
      break;
    default:
      return assertNever(roomView);
  }

  const roleLabel = participant.role === "host" ? t("role.host") : t("role.guest");

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
    </PageShell>
  );
}
