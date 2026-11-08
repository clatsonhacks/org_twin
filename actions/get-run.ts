import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getRun } from "../server/org/store.js";
import { nextHint } from "./lib/next.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Read one run with every step's status and output, plus what to do next. Use it to continue a run after a person approved a step.",
  schema: z.object({ runId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ runId }, ctx) => {
    const run = await getRun(owner(ctx), runId);
    return { run, next: nextHint(run) };
  },
});
