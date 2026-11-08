import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadSampleCompany } from "../server/org/sample.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Replace the current org with the built-in sample company (Northwind Robotics: 6 departments, skills and two cross-team workflows). Use when the user wants a demo or has no company yet.",
  schema: z.object({}),
  run: async (_args, ctx) => loadSampleCompany(owner(ctx)),
});
