import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { startRun } from "../server/org/store.js";
import { nextHint } from "./lib/next.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Start running a workflow. Returns the run with its steps and what to do next. You then perform each work step yourself and record it with complete-step, one step at a time, until the run finishes or reaches an approval step.",
  schema: z.object({
    workflowId: z.string(),
    input: z.string().default("").describe("Optional starting context, e.g. the deal or customer this run is about"),
  }),
  chatUI: { renderer: "orgtwin.run-card", title: "Workflow run" },
  link: ({ result }) => {
    const run = (result as { run?: { name?: string } } | undefined)?.run;
    return run ? mapLink({ panel: "runs", label: `Run: ${run.name}` }) : null;
  },
  run: async ({ workflowId, input }, ctx) => {
    const run = await startRun(owner(ctx), workflowId, input);
    return { run, next: nextHint(run) };
  },
});
