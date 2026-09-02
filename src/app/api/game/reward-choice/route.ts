import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/http";
import { chooseRewardBrand } from "@/lib/manager";
import { requireViewer } from "@/lib/session";

const schema = z.object({ grantId: z.string().uuid(), brand: z.string().min(2).max(40) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    return Response.json(await chooseRewardBrand(await requireViewer(), input.grantId, input.brand));
  } catch (error) {
    return apiError(error);
  }
}
