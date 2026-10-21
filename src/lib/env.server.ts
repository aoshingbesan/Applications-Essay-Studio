import "server-only";

export const DEFAULT_MODEL = "claude-opus-5-5";

export function getAnthropicConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return { apiKey, model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL };
}

export function getAiRateLimitPerHour(): number {
  const raw = Number(process.env.AI_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 40;
}

/**
 * Deterministic AI fixtures for automated end-to-end tests. Only honoured outside production
 * builds, so a misconfigured deployment can never serve simulated AI output.
 */
export function isAiMockMode(): boolean {
  return process.env.AI_MOCK_RESPONSES === "1" && process.env.NODE_ENV !== "production";
}
