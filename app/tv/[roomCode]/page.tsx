import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { JoinQrCode } from "@/app/tv/[roomCode]/join-qr-code";
import { NewRoomLink } from "@/app/tv/[roomCode]/new-room-link";
import { getAvailableRoom } from "@/lib/rooms";

function UnavailableRoom({ title, description }: Readonly<{ title: string; description: string }>): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="max-w-xl text-center">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">{description}</p>
        <NewRoomLink />
      </section>
    </main>
  );
}

export default async function TvRoomPage({
  params,
}: Readonly<{
  params: Promise<{ roomCode: string }>;
}>): Promise<ReactNode> {
  const t = await getTranslations("TvRoom");
  const { roomCode } = await params;

  await connection();

  const room = await getAvailableRoom(roomCode);

  if (!room) {
    return <UnavailableRoom title={t("error.unavailableTitle")} description={t("error.unavailableDescription")} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50 sm:py-16">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-12 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{t("join.title")}</h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">{t("join.description")}</p>
          <div className="mt-10">
            <p className="text-sm font-semibold tracking-[0.2em] text-slate-400 uppercase">{t("join.roomCodeLabel")}</p>
            <p className="mt-2 font-mono text-6xl font-black tracking-[0.16em] text-white sm:text-8xl">{room.code}</p>
          </div>
          <p className="mt-10 inline-flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-base text-slate-200 ring-1 ring-white/10">
            <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
            {t("join.waitingParticipants")}
          </p>
        </div>
        <JoinQrCode roomCode={room.code} />
      </section>
    </main>
  );
}
