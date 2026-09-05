"use client";

import { RoomParticipantSubscriptionManager } from "@/app/room-participants/room-participant-subscription-manager";
import type { RoomParticipantSubscription } from "@/app/room-participants/room-participant-sync";
import { realtime } from "@/lib/supabase/client";

const subscriptionManager = new RoomParticipantSubscriptionManager(realtime);

export function createSupabaseRoomParticipantSubscription(realtimeTopic: string): RoomParticipantSubscription {
  return subscriptionManager.create(realtimeTopic);
}
