import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { decideApproval } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

// Human-only: hidden from the agent and from MCP/A2A, so an agent can never approve its own work.
export default defineAction({
  description: "Approve or reject the approval step a run is waiting on. People only.",
  schema: z.object({
    runId: z.string(),
    approve: z.boolean(),
    note: z.string().default(""),
  }),
  agentTool: false,
  mcpTool: false,
  toolCallable: false,
  run: async ({ runId, approve, note }, ctx) => {
    const me = owner(ctx);
    return decideApproval(me, runId, approve, note, me);
  },
});
