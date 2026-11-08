import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret, secret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Send a message to the connected Telegram chat. The user approves before it is sent.",
  schema: z.object({
    text: z.string().min(1).max(4000),
    chatId: z.string().optional().describe("Override the default chat id"),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ text, chatId, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "telegram");
    const token = await requireSecret("TELEGRAM_BOT_TOKEN", "Telegram");
    const chat = chatId || (await secret("TELEGRAM_CHAT_ID"));
    if (!chat) throw new Error("Telegram chat id is missing (TELEGRAM_CHAT_ID).");
    await httpJson(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", json: { chat_id: chat, text } }, "Telegram");
    return { sent: true, channel: "telegram" };
  },
});
