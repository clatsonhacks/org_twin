import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { completeStep } from "../server/org/store.js";
import { nextHint } from "./lib/next.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Record the result of the active work step of a run and move the run forward. output must be the real work product (the drafted email, the invoice lines, the analysis), not a description of it. Never use this for approval steps; people approve those on the map.",
  schema: z.object({
    runId: z.string(),
    stepIndex: z.number().int().min(0),
    output: z.string().min(1).describe("Markdown work product of this step"),
    minutesSaved: z.number().int().min(0).max(600).describe("Honest estimate of the minutes a person would have spent"),
  }),
  // Show the run card in chat when the run needs a person or has finished; other steps stay compact.
  chatUI: {
    renderer: "orgtwin.run-card",
    title: "Workflow run",
    when: (_args, result) => {
      const status = (result as { status?: string } | undefined)?.status;
      return status === "waiting_approval" || status === "done";
    },
  },
  link: ({ result }) => {
    const run = (result as { run?: { name?: string } } | undefined)?.run;
    return run ? mapLink({ panel: "runs", label: `Run: ${run.name}` }) : null;
  },
  run: async ({ runId, stepIndex, output, minutesSaved }, ctx) => {
    let run;
    try {
      run = await completeStep(owner(ctx), runId, stepIndex, output, minutesSaved);
    } catch (error) {
      // Give the agent the reason (e.g. "waiting for approval") instead of a bare failure.
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
    return {
      ok: true as const,
      run,
      runId: run.id,
      status: run.status,
      currentStep: run.currentStep,
      next: nextHint(run),
    };
  },
});
