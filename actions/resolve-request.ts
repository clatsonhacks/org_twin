import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { updateRequest } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Route and/or answer a team request. First call with status='in_progress' and the departmentId (and skillId if a skill fits) that should handle it, so the map shows it travelling there. Then do the work using that skill's steps and call again with status='done' and the result in markdown. If no skill fits, still answer, and suggest a new skill with save-skill.",
  schema: z.object({
    id: z.string(),
    status: z.enum(["open", "in_progress", "done"]).optional(),
    departmentId: z.string().optional(),
    skillId: z.string().optional(),
    result: z.string().optional(),
  }),
  run: async ({ id, ...patch }, ctx) => updateRequest(owner(ctx), id, patch),
});
