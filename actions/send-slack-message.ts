import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Post a message to the connected Slack channel (Slack mrkdwn). The user approves before it is sent.",
  schema: z.object({ text: z.string().min(1).max(3500), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  needsApproval: true,
  run: async ({ text, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "slack");
    const url = await requireSecret("SLACK_WEBHOOK_URL", "Slack");
    await httpJson(url, { method: "POST", json: { text } }, "Slack");
    return { sent: true, channel: "slack" };
  },
});
