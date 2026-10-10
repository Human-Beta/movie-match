"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";
import { browserTimerScheduler, type TimerId, type TimerScheduler } from "@/app/room-participants/timer-scheduler";

export const JOIN_ROOM_REFRESH_MS = 5_000;

export function startRoomExpirationRefresh({
  expiresAt,
  refresh,
  scheduler = browserTimerScheduler,
  now = Date.now,
}: Readonly<{ expiresAt: string; refresh: () => void; scheduler?: TimerScheduler; now?: () => number }>): () => void {
  const deadline = Date.parse(expiresAt);
  let active = true;
  let timer: TimerId | null = null;

  function schedule(): void {
    if (!active) {
      return;
    }
    const remaining = deadline - now();
    const delay = remaining > 0 ? Math.min(JOIN_ROOM_REFRESH_MS, remaining) : JOIN_ROOM_REFRESH_MS;
    timer = scheduler.setTimeout(() => {
      if (!active) {
        return;
      }
      refresh();
      schedule();
    }, delay);
  }

  schedule();

  return (): void => {
    active = false;
    if (timer !== null) {
      scheduler.clearTimeout(timer);
    }
  };
}

export function useRoomExpirationRefresh(expiresAt: string): void {
  const router = useRouter();
  const refresh = useEffectEvent((): void => router.refresh());

  useEffect(() => startRoomExpirationRefresh({ expiresAt, refresh: (): void => refresh() }), [expiresAt]);
}
