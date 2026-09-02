import { z } from "zod";
import { awardRolls } from "@/lib/game";
import { apiError, assertSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/session";

const schema = z.object({
  membershipIds: z.array(z.string().uuid()).min(1).max(12),
  reason: z.string().trim().min(3).max(160).default("Продажа абонемента или подписки"),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    return Response.json(
      await awardRolls(await requireRole(["owner", "manager"]), input.membershipIds, input.reason),
    );
  } catch (error) {
    return apiError(error);
  }
}
