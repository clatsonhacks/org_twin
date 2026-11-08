import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { addMessage, resolveDepartmentId } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Send an A2A task from one department's agent to another (e.g. Sales asks Finance to invoice a deal). The map animates it and the receiving team's agent picks it up. Runs already send these automatically when a step moves to another team; use this for ad-hoc requests between teams.",
  schema: z.object({
    fromDepartmentId: z.string(),
    toDepartmentId: z.string(),
    text: z.string().min(1).describe("What the receiving team should do"),
    data: z.record(z.string(), z.unknown()).optional().describe("Structured payload, e.g. the deal or invoice"),
    runId: z.string().optional(),
  }),
  run: async (args, ctx) => {
    const me = owner(ctx);
    return addMessage(me, {
      kind: "task",
      runId: args.runId,
      fromDepartmentId: await resolveDepartmentId(me, args.fromDepartmentId),
      toDepartmentId: await resolveDepartmentId(me, args.toDepartmentId),
      text: args.text,
      data: args.data,
    });
  },
});
