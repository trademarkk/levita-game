import { NextResponse } from "next/server";
import { z } from "zod";
import { createRoom } from "@/lib/rooms";
import { apiError, assertSameOrigin } from "@/lib/http";
import { createSession } from "@/lib/session";

const schema = z.object({
  roomName: z.string().trim().min(3).max(80),
  ownerName: z.string().trim().min(2).max(60),
  ownerPin: z.string().regex(/^\d{4,8}$/),
  seasonName: z.string().trim().min(2).max(80),
  endsAt: z.coerce.date(),
  finalPrize: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const created = await createRoom(input);
    await createSession(created.userId, created.membershipId);
    const roomUrl = new URL(`/room/${created.slug}`, new URL(request.url).origin).toString();
    return NextResponse.json({ ok: true, roomUrl, slug: created.slug });
  } catch (error) {
    return apiError(error);
  }
}
