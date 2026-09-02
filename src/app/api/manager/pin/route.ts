import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { updateOwnRoomPin } from "@/lib/rooms";
import { requireRole } from "@/lib/session";

const schema = z.object({ pin: z.string().regex(/^\d{4,8}$/) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireRole(["owner", "manager"]);
    const { pin } = schema.parse(await request.json());
    return Response.json(await updateOwnRoomPin(viewer, pin));
  } catch (error) {
    return apiError(error);
  }
}
