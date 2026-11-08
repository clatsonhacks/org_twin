import { defineAction } from "@agent-native/core/action";
import { readResource } from "@agent-native/core/resources";
import { z } from "zod";

import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Read whether the weekly digest recurring job is on, its cron schedule, channel and last run status.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    owner(ctx);
    const text = await readResource("jobs/orgtwin-weekly-digest.md").catch(() => null);
    if (!text) return { exists: false as const };
    const field = (k: string) => text.match(new RegExp(`^${k}:\\s*"?([^"\\n]*)"?`, "m"))?.[1]?.trim() ?? null;
    return {
      exists: true as const,
      enabled: field("enabled") !== "false",
      schedule: field("schedule"),
      post: text.match(/post="(\w+)"/)?.[1] ?? "none",
      lastRun: field("lastRun"),
      lastStatus: field("lastStatus"),
      nextRun: field("nextRun"),
    };
  },
});
