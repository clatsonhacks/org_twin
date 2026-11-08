import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { deleteSkill } from "../server/org/store.js";
import { syncTeamAgents } from "../server/org/team-agents.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Delete a skill.",
  schema: z.object({ id: z.string() }),
  run: async ({ id }, ctx) => {
    await deleteSkill(owner(ctx), id);
    await syncTeamAgents(owner(ctx), []);
    return { deleted: id };
  },
});
