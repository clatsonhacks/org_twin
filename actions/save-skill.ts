import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { upsertSkill } from "../server/org/store.js";
import { syncTeamAgents } from "../server/org/team-agents.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Teach a department's agent a skill (a repeatable job), or update one when id is given. Steps should be concrete enough that you could execute them later from the text alone. minutesSaved = how many minutes this job usually takes a person by hand each time (the time the AI teammate saves). Use the number the person gave; otherwise estimate it honestly from the steps, never a placeholder.",
  schema: z.object({
    id: z.string().optional(),
    departmentId: z.string().describe("Department id (or exact name)"),
    name: z.string().min(1).describe("Short verb phrase, e.g. 'Draft invoice from won deal'"),
    description: z.string().default("").describe("When to use it and what it produces"),
    steps: z.array(z.object({ title: z.string(), detail: z.string().default("") })).default([]),
    minutesSaved: z
      .number()
      .int()
      .min(0)
      .max(600)
      .optional()
      .describe("Minutes this usually takes a person by hand. Your honest estimate unless the person said."),
    tools: z
      .array(z.string())
      .optional()
      .describe(
        "Outside tools this skill may use: slack, discord, teams, telegram, email, notion, hubspot, stripe, sheets, github, web, webhook, or mcp:<server name> for a connected MCP server. Only grant what the steps need.",
      ),
  }),
  link: ({ result }) => {
    const s = result as { departmentId?: string; name?: string } | undefined;
    return s?.departmentId ? mapLink({ dept: s.departmentId, label: `Skill: ${s.name}` }) : null;
  },
  run: async (args, ctx) => {
    const me = owner(ctx);
    // New skill without an estimate: a rough one from the number of steps (people can change it on the card).
    const minutesSaved = args.minutesSaved ?? (args.id ? undefined : Math.max(10, args.steps.length * 10));
    const saved = await upsertSkill(me, { ...args, minutesSaved });
    await syncTeamAgents(me);
    return saved;
  },
});
