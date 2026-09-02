import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { JoinRoomForm } from "@/app/join/[roomCode]/join-form";
import { FullRoomState, JoinedRoomState, UnavailableRoomState } from "@/app/join/[roomCode]/room-states";
import { assertNever } from "@/lib/assert-never";
import { getParticipantJoinView } from "@/lib/participants";
import { getParticipantCookieName } from "@/lib/participants/participant-cookie";
import { normalizeRoomCode } from "@/lib/rooms/room-code";

export default async function JoinRoomPage({
  params,
}: Readonly<{
  params: Promise<{ roomCode: string }>;
}>): Promise<ReactNode> {
  const { roomCode } = await params;
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const cookieStore = await cookies();
  const storedAccessToken = normalizedRoomCode ? (cookieStore.get(getParticipantCookieName(normalizedRoomCode))?.value ?? null) : null;
  const view = await getParticipantJoinView(roomCode, storedAccessToken);

  switch (view.status) {
    case "unavailable":
      return <UnavailableRoomState />;
    case "full":
      return <FullRoomState />;
    case "joined":
      return (
        <JoinedRoomState
          participant={{
            name: view.participant.name,
            role: view.participant.role,
          }}
        />
      );
    case "form":
      return <JoinRoomForm roomCode={view.roomCode} />;
    default:
      return assertNever(view);
  }
}
