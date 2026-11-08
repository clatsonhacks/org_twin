import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { deleteRequest } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Delete a team request.",
  schema: z.object({ id: z.string() }),
  run: async ({ id }, ctx) => {
    await deleteRequest(owner(ctx), id);
    return { deleted: id };
  },
});
