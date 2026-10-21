"use client";

import { toast } from "sonner";
import type { ActionResult } from "@/lib/domain/types";

/** Shows feedback for a server action result. Returns the data on success, otherwise null. */
export function handleResult<T>(result: ActionResult<T>, success?: string): T | null {
  if (result.ok) {
    if (success) toast.success(success);
    return result.data;
  }
  if (result.code === "unauthenticated") {
    toast.error("Your session has expired", {
      description: "Sign in again to continue. Unsaved changes on this page are kept until you leave it.",
      action: { label: "Sign in", onClick: () => window.open("/login", "_blank") },
      duration: 15000,
    });
  } else {
    toast.error(result.error);
  }
  return null;
}

export interface ApiError {
  error: string;
  status: number;
  code?: string;
  retryable?: boolean;
  issues?: string[];
  missing?: { label: string }[];
}

/** POSTs JSON to an API route and returns a typed result without throwing. */
export async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        error: {
          status: res.status,
          error: json?.error ?? `Request failed (${res.status}).`,
          code: json?.code ?? (res.status === 401 ? "unauthenticated" : undefined),
          retryable: json?.retryable ?? res.status >= 500,
          issues: json?.issues,
          missing: json?.missing,
        },
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: { status: 0, error: "Network error. Check your connection and try again.", retryable: true } };
  }
}

export function toastApiError(error: ApiError) {
  if (error.code === "unauthenticated") {
    handleResult({ ok: false, error: error.error, code: "unauthenticated" });
    return;
  }
  toast.error(error.error, { description: error.issues?.join("; ") });
}
