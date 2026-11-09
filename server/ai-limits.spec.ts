import { describe, expect, it } from "vitest";

import { limitReached, startOfUtcDay, type AiLimits, type AiUsage } from "./ai-limits.js";

const limits: AiLimits = { userDailyTurns: 40, userDailyTokens: 400_000, userPerMinute: 4, dailyTokens: 4_000_000, exempt: ["owner@example.com"] };
const fresh: AiUsage = { turnsToday: 0, tokensToday: 0, turnsLastMinute: 0, appTokensToday: 0 };

describe("limitReached", () => {
  it("lets a fresh person through", () => {
    expect(limitReached("a@example.com", fresh, limits)).toBeNull();
  });

  it("stops a person at the daily turn, daily token and per-minute limits", () => {
    expect(limitReached("a@example.com", { ...fresh, turnsToday: 40 }, limits)).toMatch(/40 AI requests/);
    expect(limitReached("a@example.com", { ...fresh, tokensToday: 400_000 }, limits)).toMatch(/allowance/);
    expect(limitReached("a@example.com", { ...fresh, turnsLastMinute: 4 }, limits)).toMatch(/last minute/);
  });

  it("stops everyone, the exempt owner included, at the app-wide daily limit", () => {
    const spent = { ...fresh, appTokensToday: 4_000_000 };
    expect(limitReached("a@example.com", spent, limits)).toMatch(/everyone/);
    expect(limitReached("Owner@Example.com", spent, limits)).toMatch(/everyone/);
  });

  it("skips per-person limits for exempt emails", () => {
    expect(limitReached("Owner@Example.com", { ...fresh, turnsToday: 999, turnsLastMinute: 99 }, limits)).toBeNull();
  });

  it("treats 0 as no limit", () => {
    const off = { ...limits, userDailyTurns: 0, userPerMinute: 0 };
    expect(limitReached("a@example.com", { ...fresh, turnsToday: 999, turnsLastMinute: 99 }, off)).toBeNull();
  });
});

it("starts the day at UTC midnight", () => {
  expect(startOfUtcDay(Date.UTC(2026, 10, 9, 23, 59))).toBe(Date.UTC(2026, 10, 9));
});
