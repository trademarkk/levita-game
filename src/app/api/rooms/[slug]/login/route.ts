import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPin } from "@/lib/crypto";
import { query } from "@/lib/db";
import { apiError, assertSameOrigin, HttpError } from "@/lib/http";
import { createSession } from "@/lib/session";

const schema = z.object({ pin: z.string().regex(/^\d{4,8}$/) });

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    assertSameOrigin(request);
    const { slug } = await context.params;
    const { pin } = schema.parse(await request.json());
    const room = await query("SELECT id FROM rooms WHERE slug = ? LIMIT 1", [slug]);
    if (!room.rows[0]) throw new HttpError(404, "Комната не найдена.");
    const roomId = String(room.rows[0].id);
    const members = await query(
      `SELECT u.id AS user_id, u.pin_hash, u.pin_salt, m.id AS membership_id, m.role
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.room_id = ? AND m.is_active = 1
       ORDER BY m.joined_at`,
      [roomId],
    );
    for (const member of members.rows) {
      if (await verifyPin(pin, String(member.pin_hash), String(member.pin_salt))) {
        await createSession(String(member.user_id), String(member.membership_id));
        const role = String(member.role);
        return NextResponse.json({
          ok: true,
          role,
          redirectTo: role === "owner" || role === "manager" ? "/manager" : "/game",
        });
      }
    }
    throw new HttpError(401, "Неверный PIN для этой комнаты.");
  } catch (error) {
    return apiError(error);
  }
}
