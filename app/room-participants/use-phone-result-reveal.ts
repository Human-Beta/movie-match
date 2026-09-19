"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { PhoneResultRevealController } from "@/app/room-participants/phone-result-reveal-controller";
import { getTerminalRoundPresentation, type TerminalRoundPresentation } from "@/app/room-participants/round-result-presentation";
import { createSupabaseResultRevealSubscription } from "@/app/room-participants/supabase-room-participant-subscription";
import { browserTimerScheduler } from "@/app/room-participants/timer-scheduler";
import type { PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

export type PhoneResultRevealState = {
  presentation: TerminalRoundPresentation | null;
  revealed: boolean;
};

export function usePhoneResultReveal({
  initialRound,
  realtimeTopic,
  round,
}: Readonly<{
  initialRound: PublicRoomRound | null;
  realtimeTopic: string;
  round: PublicRoomRound | null;
}>): PhoneResultRevealState {
  const presentation = useMemo(() => getTerminalRoundPresentation(round), [round]);
  const [initialPresentationKey] = useState(() => getTerminalRoundPresentation(initialRound)?.key ?? null);
  const controllerRef = useRef<PhoneResultRevealController | null>(null);
  const [revealedPresentationKey, setRevealedPresentationKey] = useState(initialPresentationKey);
  const getCurrentPresentation = useEffectEvent((): TerminalRoundPresentation | null => presentation);

  useEffect(() => {
    const controller = new PhoneResultRevealController({
      onReveal: setRevealedPresentationKey,
      scheduler: browserTimerScheduler,
    });
    const currentPresentation = getCurrentPresentation();

    controllerRef.current = controller;
    controller.updatePresentation(currentPresentation, currentPresentation?.key === initialPresentationKey);

    const subscription = createSupabaseResultRevealSubscription(realtimeTopic);
    subscription.onResultRevealReady(hint => {
      controller.receiveHint(hint);
    });

    return (): void => {
      controller.stop();
      controllerRef.current = null;
      subscription.dispose();
    };
  }, [initialPresentationKey, realtimeTopic]);

  useEffect(() => {
    controllerRef.current?.updatePresentation(presentation, presentation?.key === initialPresentationKey);
  }, [initialPresentationKey, presentation]);

  return {
    presentation,
    revealed: presentation !== null && revealedPresentationKey === presentation.key,
  };
}
