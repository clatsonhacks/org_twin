import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadSampleCompany } from "../server/org/sample.js";
import { getSnapshot } from "../server/org/store.js";
import { syncTeamAgents } from "../server/org/team-agents.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Replace the current org with the built-in sample company (Northwind Robotics: 6 departments, skills and two cross-team workflows). Use when the user wants a demo or has no company yet.",
  schema: z.object({}),
  run: async (_args, ctx) => {
    const me = owner(ctx);
    const before = (await getSnapshot(me)).departments.map((d) => d.id);
    const result = await loadSampleCompany(me);
    const after = new Set((await getSnapshot(me)).departments.map((d) => d.id));
    return { ...result, teamAgents: await syncTeamAgents(me, before.filter((id) => !after.has(id))) };
  },
});
