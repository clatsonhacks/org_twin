import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Post a message to the connected Discord channel. Use <@USER_ID> to mention someone. The user approves before it is sent.",
  schema: z.object({ text: z.string().min(1).max(2000), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  needsApproval: true,
  run: async ({ text, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "discord");
    const url = await requireSecret("DISCORD_WEBHOOK_URL", "Discord");
    await httpJson(url, { method: "POST", json: { content: text, allowed_mentions: { parse: ["users"] } } }, "Discord");
    return { sent: true, channel: "discord" };
  },
});
