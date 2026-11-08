import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { createRequest } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Log an 'ask a team' request: a person asks the company for some work in plain language (e.g. 'I need an analysis of Q3 churn'). After creating it, route and answer it with resolve-request.",
  schema: z.object({
    fromName: z.string().min(1).describe("Who is asking"),
    fromDepartmentId: z.string().optional().describe("The asker's department id or name"),
    text: z.string().min(1),
  }),
  run: async (args, ctx) => createRequest(owner(ctx), args),
});
