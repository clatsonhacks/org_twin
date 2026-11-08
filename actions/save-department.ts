import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { upsertDepartment } from "../server/org/store.js";
import { syncTeamAgents } from "../server/org/team-agents.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Create a department, or update one when id is given (only the fields you pass change). Departments are the buildings on the map.",
  schema: z.object({
    id: z.string().optional().describe("Existing department id to update; omit to create"),
    name: z.string().min(1),
    emoji: z.string().optional(),
    color: z.string().optional().describe("Hex colour, e.g. #10b981"),
    mission: z.string().optional(),
    headcount: z.number().int().min(1).optional(),
    hoursAutomatable: z.number().int().min(0).max(2000).optional(),
    roles: z.array(z.object({ title: z.string(), count: z.number().int().min(1) })).optional(),
  }),
  link: ({ result }) => {
    const d = result as { id?: string; name?: string } | undefined;
    return d?.id ? mapLink({ dept: d.id, label: `${d.name} on the map` }) : null;
  },
  run: async (args, ctx) => {
    const me = owner(ctx);
    const saved = await upsertDepartment(me, args);
    await syncTeamAgents(me);
    return saved;
  },
});
