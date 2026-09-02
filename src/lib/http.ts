import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requested = new URL(request.url);
  if (new URL(origin).host !== requested.host) throw new HttpError(403, "Запрос отклонён.");
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Проверьте заполненные поля.", details: error.issues }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Произошла внутренняя ошибка." }, { status: 500 });
}
