"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import QRCode from "react-qr-code";

const subscribeToOrigin = (): (() => void) => (): void => undefined;
const getBrowserOrigin = (): string => window.location.origin;
const getServerOrigin = (): null => null;

export function JoinQrCode({ roomCode }: Readonly<{ roomCode: string }>): ReactNode {
  const t = useTranslations("TvRoom");
  const origin = useSyncExternalStore(subscribeToOrigin, getBrowserOrigin, getServerOrigin);
  const joinUrl = origin ? new URL(`/join/${roomCode}`, origin).toString() : null;

  if (!joinUrl) {
    return <div className="flex min-h-72 items-center justify-center rounded-3xl bg-white p-6 text-slate-700">{t("qr.preparing")}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="mx-auto w-full max-w-72 rounded-3xl bg-white p-4 shadow-2xl shadow-black/30">
        <QRCode
          bgColor="#ffffff"
          fgColor="#020617"
          level="M"
          size={256}
          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
          title={t("qr.title", { roomCode })}
          value={joinUrl}
          viewBox="0 0 256 256"
        />
      </div>
      <a className="block text-base break-all text-slate-300 underline decoration-slate-500 underline-offset-4 hover:text-white" href={joinUrl}>
        {joinUrl}
      </a>
    </div>
  );
}
