import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { connectorStatus } from "../server/connectors/registry.js";

export default defineAction({
  description:
    "List the connectors (Slack, Discord, Teams, Telegram, email, Notion, HubSpot, Stripe test, Google Sheets, GitHub, web search, webhooks): which are connected, which keys are missing, and the actions each one provides. Never returns secret values. For other apps (Gmail, Linear, Jira…) the user can add a remote MCP server from the chat's + menu.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => ({ connectors: await connectorStatus() }),
});
