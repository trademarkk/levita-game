import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { issueReward } from "@/lib/manager";
import { requireRole } from "@/lib/session";

const schema = z.object({ grantId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    return Response.json(await issueReward(await requireRole(["owner", "manager"]), input.grantId));
  } catch (error) {
    return apiError(error);
  }
}
