import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getSnapshot } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Read the whole company twin: company profile, departments (buildings on the map), each department's skills, cross-team workflows, the 20 latest runs with step outputs, team requests, and totals (hours automatable / saved, approvals waiting).",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  deferLoading: false,
  run: async (_args, ctx) => getSnapshot(owner(ctx)),
});
