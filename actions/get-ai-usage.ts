import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { aiLimits, aiUsage, limitReached } from "../server/ai-limits.js";
import { person } from "./lib/owner.js";

export default defineAction({
  description:
    "Show how much of today's AI allowance the current person has used (chat requests and tokens) and the limits. Limits reset at midnight UTC.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    const email = person(ctx);
    const limits = aiLimits();
    const usage = await aiUsage(email);
    const exempt = limits.exempt.includes(email.toLowerCase());
    return {
      turnsToday: usage.turnsToday,
      tokensToday: usage.tokensToday,
      limits: {
        dailyTurns: exempt ? 0 : limits.userDailyTurns,
        dailyTokens: exempt ? 0 : limits.userDailyTokens,
        perMinute: exempt ? 0 : limits.userPerMinute,
      },
      exempt,
      blocked: limitReached(email, usage, limits),
    };
  },
});
