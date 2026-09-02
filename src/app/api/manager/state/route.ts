import { apiError } from "@/lib/http";
import { getManagerState } from "@/lib/manager";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getManagerState(await requireRole(["owner", "manager"])));
  } catch (error) {
    return apiError(error);
  }
}
