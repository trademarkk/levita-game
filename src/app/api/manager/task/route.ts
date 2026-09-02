import { z } from "zod";
import { completeTask } from "@/lib/game";
import { apiError, assertSameOrigin } from "@/lib/http";
import { requireRole } from "@/lib/session";

const schema = z.object({ assignmentId: z.string().uuid(), proofNote: z.string().trim().max(500).default("") });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    return Response.json(
      await completeTask(await requireRole(["owner", "manager"]), input.assignmentId, input.proofNote),
    );
  } catch (error) {
    return apiError(error);
  }
}
