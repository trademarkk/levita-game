import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { resetBoardCell, updateBoardCell } from "@/lib/manager";
import { requireRole } from "@/lib/session";

const updateSchema = z.object({
  action: z.literal("update"),
  cellNumber: z.number().int().min(1).max(59),
  type: z.enum(["normal", "treasure", "surprise", "setback", "trap", "accelerate"]),
  title: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  taskAchievementTag: z.enum(["review", "client_photo"]).nullable().optional(),
  effect: z.enum(["move", "extra_roll"]).optional(),
  value: z.number().int().min(1).max(2).optional(),
  rewardName: z.string().max(160).optional(),
  rewardValue: z.number().int().min(1).max(5000).optional(),
  rewardQuantity: z.number().int().min(1).max(20).optional(),
  rewardBrandChoices: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
});

const resetSchema = z.object({
  action: z.literal("reset"),
  cellNumber: z.number().int().min(1).max(59),
});

const schema = z.discriminatedUnion("action", [updateSchema, resetSchema]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireRole(["owner", "manager"]);
    const input = schema.parse(await request.json());
    return Response.json(
      input.action === "reset"
        ? await resetBoardCell(viewer, input.cellNumber)
        : await updateBoardCell(viewer, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
