/**
 * Limits on the AI key (Vultr Serverless Inference): every model call is recorded by the framework in
 * `token_usage` (one row per call, with tokens and the run it belongs to). Before a new chat turn or a
 * Skill Recorder vision call starts, these limits are checked and the request is refused with a clear
 * message when one is reached. Days are UTC days.
 *
 * Configure with environment variables (0 turns a limit off):
 *   AI_LIMIT_USER_DAILY_TURNS    chat turns a person can start per day          (default 15)
 *   AI_LIMIT_USER_DAILY_TOKENS   tokens a person can use per day                (default 1000000)
 *   AI_LIMIT_USER_PER_MINUTE     chat turns a person can start per minute       (default 3)
 *   AI_LIMIT_DAILY_TOKENS        tokens the whole app can use per day           (default 1500000)
 *
 * A chat turn costs roughly 50–100k tokens (system prompt and tool definitions are sent with every model call).
 *   AI_LIMIT_EXEMPT_EMAILS       comma-separated emails without per-person limits (the app-wide limit still applies)
 */
import { getDbExec } from "@agent-native/core/db";
import { recordUsage } from "@agent-native/core/usage";
import { HTTPError } from "h3";

export interface AiLimits {
  userDailyTurns: number;
  userDailyTokens: number;
  userPerMinute: number;
  dailyTokens: number;
  exempt: string[];
}

const num = (name: string, fallback: number) => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export function aiLimits(): AiLimits {
  return {
    userDailyTurns: num("AI_LIMIT_USER_DAILY_TURNS", 15),
    userDailyTokens: num("AI_LIMIT_USER_DAILY_TOKENS", 1_000_000),
    userPerMinute: num("AI_LIMIT_USER_PER_MINUTE", 3),
    dailyTokens: num("AI_LIMIT_DAILY_TOKENS", 1_500_000),
    exempt: (process.env.AI_LIMIT_EXEMPT_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function startOfUtcDay(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface AiUsage {
  turnsToday: number;
  tokensToday: number;
  turnsLastMinute: number;
  appTokensToday: number;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

/** Today's usage for one person and for the whole app, from the framework's token_usage table. */
export async function aiUsage(email: string, now = Date.now()): Promise<AiUsage> {
  const db = getDbExec();
  const since = startOfUtcDay(now);
  try {
    const mine = await db.execute({
      sql: `SELECT
              COUNT(DISTINCT CASE WHEN run_id IS NOT NULL AND run_id <> '' THEN run_id END) AS turns,
              COUNT(DISTINCT CASE WHEN created_at >= ? AND run_id IS NOT NULL AND run_id <> '' THEN run_id END) AS turns_minute,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
            FROM token_usage WHERE owner_email = ? AND created_at >= ?`,
      args: [now - 60_000, email, since],
    });
    const all = await db.execute({
      sql: `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens FROM token_usage WHERE created_at >= ?`,
      args: [since],
    });
    const m = mine.rows[0] ?? {};
    return {
      turnsToday: n(m.turns),
      tokensToday: n(m.tokens),
      turnsLastMinute: n(m.turns_minute),
      appTokensToday: n(all.rows[0]?.tokens),
    };
  } catch (e) {
    // No usage table yet (fresh database): nothing has been used.
    if (/token_usage/i.test(String((e as Error)?.message))) {
      return { turnsToday: 0, tokensToday: 0, turnsLastMinute: 0, appTokensToday: 0 };
    }
    throw e;
  }
}

/** Which limit (if any) this person has reached. Pure, so it is easy to test. */
export function limitReached(email: string, usage: AiUsage, limits: AiLimits): string | null {
  if (limits.dailyTokens && usage.appTokensToday >= limits.dailyTokens) {
    return "OrgTwin has used today's AI allowance for everyone. It resets at midnight UTC.";
  }
  if (limits.exempt.includes(email.toLowerCase())) return null;
  if (limits.userPerMinute && usage.turnsLastMinute >= limits.userPerMinute) {
    return `That's ${limits.userPerMinute} requests in the last minute. Wait a moment and try again.`;
  }
  if (limits.userDailyTurns && usage.turnsToday >= limits.userDailyTurns) {
    return `You've reached today's limit of ${limits.userDailyTurns} AI requests. It resets at midnight UTC.`;
  }
  if (limits.userDailyTokens && usage.tokensToday >= limits.userDailyTokens) {
    return `You've used today's AI allowance (${limits.userDailyTokens.toLocaleString("en")} tokens). It resets at midnight UTC.`;
  }
  return null;
}

/** Refuse the request (HTTP 429) when a limit is reached. */
export async function enforceAiLimits(email: string | null | undefined): Promise<void> {
  const who = email?.trim();
  if (!who) throw new HTTPError({ status: 401, message: "Sign in to use the AI agent." });
  const reason = limitReached(who, await aiUsage(who), aiLimits());
  if (reason) throw new HTTPError({ status: 429, message: reason });
}

/** Count a direct model call (made outside the agent loop) against the same limits. */
export async function recordAiCall(
  email: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  label: string,
): Promise<void> {
  await recordUsage({
    ownerEmail: email,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    model,
    label,
    app: "orgtwin",
  }).catch(() => undefined);
}
