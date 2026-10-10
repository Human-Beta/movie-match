import { DrizzleRoomCleanupRepository } from "@/lib/room-cleanup/room-cleanup-repository";
import { isCleanupAuthorized, RoomCleanupService } from "@/lib/room-cleanup/room-cleanup-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const roomCleanupService = new RoomCleanupService(new DrizzleRoomCleanupRepository());

export async function GET(request: Request): Promise<Response> {
  if (!isCleanupAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }
  const result = await roomCleanupService.run();
  console.info("room_cleanup", { at: new Date().toISOString(), ...result });
  return Response.json(result, { status: result.status === "completed" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
