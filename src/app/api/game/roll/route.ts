import { apiError, assertSameOrigin } from "@/lib/http";
import { performRoll } from "@/lib/game";
import { requireViewer } from "@/lib/session";
import { z } from "zod";

const schema = z.object({ requestId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { requestId } = schema.parse(await request.json());
    return Response.json(await performRoll(await requireViewer(), undefined, requestId));
  } catch (error) {
    return apiError(error);
  }
}
