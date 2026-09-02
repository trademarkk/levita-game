import { z } from "zod";
import { toggleChronicleReaction } from "@/lib/game";
import { apiError, assertSameOrigin } from "@/lib/http";
import { requireViewer } from "@/lib/session";

const schema = z.object({
  eventId: z.string().uuid(),
  reaction: z.enum(["applause", "roar", "fire", "crown"]),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    return Response.json(await toggleChronicleReaction(await requireViewer(), input.eventId, input.reaction));
  } catch (error) {
    return apiError(error);
  }
}
