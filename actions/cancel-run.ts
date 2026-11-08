import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { cancelRun } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Cancel a run that is still running or waiting for approval.",
  schema: z.object({ runId: z.string() }),
  run: async ({ runId }, ctx) => cancelRun(owner(ctx), runId),
});
