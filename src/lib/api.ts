import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: jsonError(422, "The request was invalid.", { issues: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message) }) };
  }
  return { ok: true, data: parsed.data };
}

export const uuidParam = z.string().uuid();
