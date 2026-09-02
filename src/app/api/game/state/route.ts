import { apiError } from "@/lib/http";
import { getGameState } from "@/lib/game";
import { requireViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getGameState(await requireViewer()));
  } catch (error) {
    return apiError(error);
  }
}
