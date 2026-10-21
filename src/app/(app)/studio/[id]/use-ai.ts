"use client";

import { useRef, useState } from "react";
import { toastApiError, type ApiError } from "@/lib/client/result";

export type AiResult<T> = { ok: true; data: T & { jobId: string } } | { ok: false; error: ApiError };

/**
 * Runs essay AI operations one at a time with an idempotency key, and lets the user cancel.
 * A cancelled request stops the provider call on the server; nothing is saved.
 */
export function useEssayAi(essayId: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const run = async <T>(label: string, body: Record<string, unknown>): Promise<AiResult<T> | null> => {
    if (controller.current) return null;
    const ctrl = new AbortController();
    controller.current = ctrl;
    setBusy(label);
    try {
      const res = await fetch(`/api/essays/${essayId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const error: ApiError = {
          status: res.status,
          error: json?.error ?? `Request failed (${res.status}).`,
          code: json?.code ?? (res.status === 401 ? "unauthenticated" : undefined),
          retryable: json?.retryable ?? res.status >= 500,
        };
        toastApiError(error);
        return { ok: false, error };
      }
      return { ok: true, data: json as T & { jobId: string } };
    } catch {
      if (ctrl.signal.aborted) return null;
      const error: ApiError = { status: 0, error: "Network error. Check your connection and try again.", retryable: true };
      toastApiError(error);
      return { ok: false, error };
    } finally {
      controller.current = null;
      setBusy(null);
    }
  };

  const cancel = () => controller.current?.abort();

  return { busy, run, cancel };
}
