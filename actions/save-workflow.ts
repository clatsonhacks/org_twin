import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { upsertWorkflow } from "../server/org/store.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Create or update (when id is given) a cross-team workflow. Each step belongs to one department. kind='work' is done by that department's agent (you); kind='approval' pauses the run until a person in that department approves on the map. Put an approval step before anything that sends money, emails customers or changes records outside the app. When consecutive steps are in different departments the map shows a handoff. Give every step a minutes estimate (time a person needs by hand); people can adjust it in the Workflows panel.",
  schema: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    goal: z.string().default(""),
    steps: z
      .array(
        z.object({
          id: z.string().optional(),
          departmentId: z.string().describe("Department id (or exact name)"),
          kind: z.enum(["work", "approval"]).default("work"),
          title: z.string().min(1),
          instructions: z.string().default("").describe("What the agent must produce in this step"),
          minutes: z
            .number()
            .int()
            .min(0)
            .max(600)
            .optional()
            .describe("Minutes this step usually takes a person by hand. Your honest estimate unless the person said."),
        }),
      )
      .min(1)
      .max(20),
  }),
  link: ({ result }) => {
    const w = result as { name?: string } | undefined;
    return w?.name ? mapLink({ panel: "workflows", label: `Workflow: ${w.name}` }) : null;
  },
  run: async (args, ctx) => upsertWorkflow(owner(ctx), args),
});
