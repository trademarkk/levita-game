import { apiError } from "@/lib/http";
import { assertCron } from "@/lib/cron";
import { sendDailySavannaDigest } from "@/lib/max-digest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertCron(request);
    const digest = await sendDailySavannaDigest(new Date());
    return Response.json({ ok: true, digest });
  } catch (error) {
    return apiError(error);
  }
}
