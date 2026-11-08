import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Post a message to the connected Microsoft Teams channel. The user approves before it is sent.",
  schema: z.object({ title: z.string().default("OrgTwin"), text: z.string().min(1).max(8000), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  needsApproval: true,
  run: async ({ title, text, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "teams");
    const url = await requireSecret("TEAMS_WEBHOOK_URL", "Microsoft Teams");
    // Adaptive card works for both classic incoming webhooks and Workflows webhooks.
    await httpJson(
      url,
      {
        method: "POST",
        json: {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                type: "AdaptiveCard",
                version: "1.4",
                body: [
                  { type: "TextBlock", text: title, weight: "Bolder", size: "Medium" },
                  { type: "TextBlock", text, wrap: true },
                ],
              },
            },
          ],
        },
      },
      "Microsoft Teams",
    );
    return { sent: true, channel: "teams" };
  },
});
