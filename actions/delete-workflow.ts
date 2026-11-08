import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { deleteWorkflow } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Delete a workflow (its past runs stay in history).",
  schema: z.object({ id: z.string() }),
  run: async ({ id }, ctx) => {
    await deleteWorkflow(owner(ctx), id);
    return { deleted: id };
  },
});
