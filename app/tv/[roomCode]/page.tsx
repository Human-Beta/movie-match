import { connection } from "next/server";
import type { ReactNode } from "react";

import { TvParticipantRoom, TvUnavailableRoom } from "@/app/tv/[roomCode]/tv-participant-room";
import { getTvParticipantRoomState } from "@/lib/participants";

export default async function TvRoomPage({
  params,
}: Readonly<{
  params: Promise<{ roomCode: string }>;
}>): Promise<ReactNode> {
  const { roomCode } = await params;

  await connection();

  const room = await getTvParticipantRoomState(roomCode);

  if (room === null) {
    return <TvUnavailableRoom />;
  }

  return <TvParticipantRoom initialSnapshot={room.snapshot} realtimeTopic={room.realtimeTopic} roomCode={room.roomCode} />;
}
