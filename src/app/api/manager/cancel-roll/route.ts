import { z } from "zod";
import { cancelRoll } from "@/lib/game";
import { apiError, assertSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/session";

const schema = z.object({ creditId: z.string().uuid(), reason: z.string().trim().min(3).max(200) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    return Response.json(
      await cancelRoll(await requireRole(["owner", "manager"]), input.creditId, input.reason),
    );
  } catch (error) {
    return apiError(error);
  }
}
