import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getRun } from "../server/org/store.js";
import { nextHint } from "./lib/next.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Read one run with every step's status and output, plus what to do next. Use it to continue a run after a person approved a step.",
  schema: z.object({ runId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  chatUI: { renderer: "orgtwin.run-card", title: "Workflow run" },
  link: ({ result }) => {
    const run = (result as { run?: { name?: string } } | undefined)?.run;
    return run ? mapLink({ panel: "runs", label: `Run: ${run.name}` }) : null;
  },
  run: async ({ runId }, ctx) => {
    const run = await getRun(owner(ctx), runId);
    return { run, next: nextHint(run) };
  },
});
