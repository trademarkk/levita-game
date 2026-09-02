import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createInvitation } from "@/lib/manager";
import { requireRole } from "@/lib/session";

const schema = z.object({ role: z.enum(["manager", "player", "observer"]) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const viewer = await requireRole(["owner", "manager"]);
    if (input.role === "manager" && viewer.role !== "owner") {
      return Response.json({ error: "Приглашать нового руководителя может только владелец." }, { status: 403 });
    }
    const invite = await createInvitation(viewer, input.role);
    const requestOrigin = new URL(request.url).origin;
    return Response.json({ ...invite, url: new URL(new URL(invite.url).pathname, requestOrigin).toString() });
  } catch (error) {
    return apiError(error);
  }
}
