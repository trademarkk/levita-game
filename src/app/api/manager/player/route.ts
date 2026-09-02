import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createRoomPlayer } from "@/lib/rooms";
import { requireRole } from "@/lib/session";

const schema = z.object({
  displayName: z.string().trim().min(2).max(60),
  branch: z.string().trim().max(60).optional().nullable(),
  avatarKey: z.string().trim().min(2).max(40),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const player = await createRoomPlayer(await requireRole(["owner", "manager"]), input);
    const origin = new URL(request.url).origin;
    return Response.json({ ...player, roomUrl: new URL(`/room/${player.roomSlug}`, origin).toString() });
  } catch (error) {
    return apiError(error);
  }
}
