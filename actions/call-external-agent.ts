import { callAgent } from "@agent-native/core/a2a";
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { assertPublicUrl } from "../server/net.js";
import { addMessage, resolveDepartmentId } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Send a message to an outside agent over the A2A protocol (another Agent-Native app, or any A2A agent) and get its reply, e.g. ask a partner's logistics agent for a delivery date. The user approves before anything is sent.",
  schema: z.object({
    url: z.string().url().describe("Base URL of the other agent (its /.well-known/agent-card.json is discovered)"),
    message: z.string().min(1),
    fromDepartmentId: z.string().optional(),
  }),
  needsApproval: true,
  run: async ({ url, message, fromDepartmentId }, ctx) => {
    const me = owner(ctx);
    await assertPublicUrl(url);
    const reply = await callAgent(url, message, { timeoutMs: 120_000 });
    await addMessage(me, {
      kind: "external",
      fromDepartmentId: fromDepartmentId ? await resolveDepartmentId(me, fromDepartmentId).catch(() => "") : "",
      toAgentUrl: url,
      text: message,
      reply: String(reply ?? ""),
    });
    return { reply };
  },
});
