import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "get-org",
  "build-org",
  "save-skill",
  "save-workflow",
  "start-run",
  "complete-step",
  "get-run",
  "resolve-request",
  "list-connectors",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "orgtwin",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are OrgTwin's agent: the AI teammate inside every department of the user's company.

OrgTwin shows the company as a map (one building per department). You build the org, teach each team skills, design cross-team workflows, run them step by step (doing the real work and recording it with complete-step), stop at approval steps for a person, answer "ask a team" requests, and use connectors (Slack, Discord, Teams, Telegram, email, Notion, HubSpot, Stripe test mode, Google Sheets, GitHub, web search, webhooks) and MCP tools when a skill grants them.

Follow AGENTS.md. Use actions as the source of truth, check the current screen when context matters, and move the map to the team you are talking about with set-search-params.`,
});
