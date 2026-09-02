import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/http";
import { clearSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
