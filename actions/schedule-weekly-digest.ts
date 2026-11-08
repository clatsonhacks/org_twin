import { defineAction } from "@agent-native/core/action";
import { writeResource } from "@agent-native/core/resources";
import { z } from "zod";

import { owner } from "./lib/owner.js";

const PATH = "jobs/orgtwin-weekly-digest.md";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default defineAction({
  description:
    "Turn the weekly digest recurring job on or off (a framework recurring job in agent resources). Each firing the agent builds the digest, posts it to Slack/Discord if chosen, and nudges teams about approvals waiting more than a day. Times are in the server's timezone (UTC on most hosts).",
  schema: z.object({
    enabled: z.boolean().default(true),
    day: z.number().int().min(0).max(6).default(1).describe("0 = Sunday … 6 = Saturday"),
    hour: z.number().int().min(0).max(23).default(9),
    post: z.enum(["none", "slack", "discord"]).default("slack"),
  }),
  run: async ({ enabled, day, hour, post }, ctx) => {
    owner(ctx);
    const schedule = `${(day * 7 + 13) % 60} ${hour} * * ${day}`;
    await writeResource(
      PATH,
      `---
schedule: "${schedule}"
enabled: ${enabled}
runAs: creator
---

# OrgTwin weekly digest

1. Call \`weekly-digest\` with post="${post}".
2. If any run has waited for approval for more than 24 hours, add a short line to the reply naming the run
   and the team that must approve, and suggest they open the map. Do not approve anything yourself.
3. Reply with the digest text so it is kept in this job's history.
`,
      { mimeType: "text/markdown" },
    );
    return {
      job: PATH,
      enabled,
      schedule,
      when: `${DAYS[day]}s at ${String(hour).padStart(2, "0")}:${String((day * 7 + 13) % 60).padStart(2, "0")} (server time)`,
      post,
    };
  },
});
