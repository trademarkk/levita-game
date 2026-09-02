import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { issueFinalPrize } from "@/lib/manager";
import { requireRole } from "@/lib/session";

const schema = z.object({ seasonId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    return Response.json(await issueFinalPrize(await requireRole(["owner", "manager"]), input.seasonId));
  } catch (error) {
    return apiError(error);
  }
}
