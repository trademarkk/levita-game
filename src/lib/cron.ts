import "server-only";

import { HttpError } from "@/lib/http";

export function assertCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, "CRON_SECRET не настроен.");
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new HttpError(401, "Неверный ключ планировщика.");
  }
}
