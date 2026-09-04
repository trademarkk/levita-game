import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { resetRoomPlayerPin } from "@/lib/rooms";
import { requireRole } from "@/lib/session";

const schema = z.object({ membershipId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { membershipId } = schema.parse(await request.json());
    const viewer = await requireRole(["owner", "manager"]);
    return Response.json(await resetRoomPlayerPin(viewer, membershipId));
  } catch (error) {
    return apiError(error);
  }
}
