import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { upsertSkill } from "../server/org/store.js";
import { syncTeamAgents } from "../server/org/team-agents.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Teach a department's agent a skill (a repeatable job), or update one when id is given. Steps should be concrete enough that you could execute them later from the text alone. minutesSaved = minutes a person saves each time it runs.",
  schema: z.object({
    id: z.string().optional(),
    departmentId: z.string().describe("Department id (or exact name)"),
    name: z.string().min(1).describe("Short verb phrase, e.g. 'Draft invoice from won deal'"),
    description: z.string().default("").describe("When to use it and what it produces"),
    steps: z.array(z.object({ title: z.string(), detail: z.string().default("") })).default([]),
    minutesSaved: z.number().int().min(0).max(600).default(15),
    tools: z
      .array(z.string())
      .optional()
      .describe(
        "Outside tools this skill may use: slack, discord, teams, telegram, email, notion, hubspot, stripe, sheets, github, web, webhook, or mcp:<server name> for a connected MCP server. Only grant what the steps need.",
      ),
  }),
  run: async (args, ctx) => {
    const me = owner(ctx);
    const saved = await upsertSkill(me, args);
    await syncTeamAgents(me);
    return saved;
  },
});
