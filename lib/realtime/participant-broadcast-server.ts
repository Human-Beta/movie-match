import "server-only";

import { clientEnv } from "@/lib/env/client";
import { createParticipantRealtimeTopic } from "@/lib/participants/participant-snapshot-service";
import { ParticipantBroadcastPublisher } from "@/lib/realtime/participant-broadcast";

const publisher = new ParticipantBroadcastPublisher({
  projectUrl: clientEnv.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export async function notifyParticipantRoomChanged(roomId: string): Promise<void> {
  await publisher.publishParticipantsChanged(createParticipantRealtimeTopic(roomId));
}
