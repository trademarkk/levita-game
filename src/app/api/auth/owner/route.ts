import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { verifyPin } from "@/lib/crypto";
import { apiError, assertSameOrigin, HttpError } from "@/lib/http";
import { createSession } from "@/lib/session";

const schema = z.object({ pin: z.string().regex(/^\d{4,8}$/), roomSlug: z.string().trim().min(3).max(100) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { pin, roomSlug } = schema.parse(await request.json());
    const result = await query(
      `SELECT u.id AS user_id, u.pin_hash, u.pin_salt, m.id AS membership_id
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN rooms r ON r.id = m.room_id
       WHERE m.role = 'owner' AND m.is_active = 1 AND r.slug = ?
       LIMIT 1`,
      [roomSlug],
    );
    const owner = result.rows[0];
    if (!owner || !(await verifyPin(pin, String(owner.pin_hash), String(owner.pin_salt)))) {
      throw new HttpError(401, "Неверный PIN владельца.");
    }
    await createSession(String(owner.user_id), String(owner.membership_id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
