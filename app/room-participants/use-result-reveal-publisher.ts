"use client";

import { useCallback, useEffect, useRef } from "react";

import { createSupabaseResultRevealSubscription } from "@/app/room-participants/supabase-room-participant-subscription";
import type { TerminalRoundPresentation } from "@/app/room-participants/round-result-presentation";
import type { ResultRevealRoomSubscription } from "@/app/room-participants/room-participant-subscription-manager";

const RESULT_REVEAL_STORAGE_PREFIX = "movie-match:result-reveal-ready:";

function wasAlreadyPublished(key: string): boolean {
  try {
    return window.sessionStorage.getItem(`${RESULT_REVEAL_STORAGE_PREFIX}${key}`) !== null;
  } catch {
    return false;
  }
}

function rememberPublished(key: string): void {
  try {
    window.sessionStorage.setItem(`${RESULT_REVEAL_STORAGE_PREFIX}${key}`, "1");
  } catch {
    // The in-memory guard still prevents duplicate hints for this mounted TV session.
  }
}

export function useResultRevealPublisher(realtimeTopic: string): (presentation: TerminalRoundPresentation) => void {
  const publishedKeysRef = useRef(new Set<string>());
  const subscriptionRef = useRef<ResultRevealRoomSubscription | null>(null);

  useEffect(() => {
    const subscription = createSupabaseResultRevealSubscription(realtimeTopic);
    subscriptionRef.current = subscription;

    return (): void => {
      subscriptionRef.current = null;
      subscription.dispose();
    };
  }, [realtimeTopic]);

  return useCallback((presentation: TerminalRoundPresentation): void => {
    const subscription = subscriptionRef.current;

    if (subscription === null || publishedKeysRef.current.has(presentation.key) || wasAlreadyPublished(presentation.key)) {
      return;
    }

    publishedKeysRef.current.add(presentation.key);
    rememberPublished(presentation.key);
    void subscription.publishResultRevealReady({ roundId: presentation.round.roundId, status: presentation.status });
  }, []);
}
