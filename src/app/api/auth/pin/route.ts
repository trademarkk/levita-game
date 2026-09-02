import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPin } from "@/lib/crypto";
import { query } from "@/lib/db";
import { apiError, assertSameOrigin, HttpError } from "@/lib/http";
import { createSession } from "@/lib/session";

const schema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  roomSlug: z.string().trim().min(3).max(100),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { pin, roomSlug } = schema.parse(await request.json());
    const result = await query(
      `SELECT u.id AS user_id, u.pin_hash, u.pin_salt, m.id AS membership_id
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN rooms r ON r.id = m.room_id
       WHERE m.is_active = 1 AND r.slug = ?
       ORDER BY m.joined_at`,
      [roomSlug],
    );
    for (const member of result.rows) {
      if (await verifyPin(pin, String(member.pin_hash), String(member.pin_salt))) {
        await createSession(String(member.user_id), String(member.membership_id));
        return NextResponse.json({ ok: true });
      }
    }
    throw new HttpError(401, "Неверный PIN для этой комнаты.");
  } catch (error) {
    return apiError(error);
  }
}
