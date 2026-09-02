import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createNextSeason, updateFinalPrize, updateSeasonEnd } from "@/lib/manager";
import { requireRole } from "@/lib/session";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update-end"), endsAt: z.iso.datetime() }),
  z.object({ action: z.literal("update-prize"), finalPrize: z.string().trim().min(1).max(200) }),
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(3).max(80),
    endsAt: z.iso.datetime(),
    finalPrize: z.string().trim().min(1).max(200),
  }),
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const viewer = await requireRole(["owner", "manager"]);
    if (input.action === "update-end") return Response.json(await updateSeasonEnd(viewer, new Date(input.endsAt)));
    if (input.action === "update-prize") return Response.json(await updateFinalPrize(viewer, input.finalPrize));
    return Response.json(await createNextSeason(viewer, input.name, new Date(input.endsAt), input.finalPrize));
  } catch (error) {
    return apiError(error);
  }
}
