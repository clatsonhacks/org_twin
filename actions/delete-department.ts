import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { deleteDepartment } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Delete a department and its skills. Ask the user before deleting.",
  schema: z.object({ id: z.string() }),
  run: async ({ id }, ctx) => {
    await deleteDepartment(owner(ctx), id);
    return { deleted: id };
  },
});
