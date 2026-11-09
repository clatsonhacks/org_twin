import { registerRequiredSecret } from "@agent-native/core/secrets";
import { resolveSecretDetailed } from "@agent-native/core/server";
import { HTTPError } from "h3";

import { getSkill } from "../org/store.js";

export interface ConnectorDef {
  id: string;
  name: string;
  emoji: string;
  what: string;
  /** Secrets needed; the first one decides "connected". */
  secrets: Array<{ key: string; label: string; docsUrl?: string; optional?: boolean }>;
  actions: string[];
  /** Works without any key (e.g. web search falls back to a keyless engine). */
  keyless?: boolean;
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "slack",
    name: "Slack",
    emoji: "💬",
    what: "Post messages to a channel",
    secrets: [{ key: "SLACK_WEBHOOK_URL", label: "Slack incoming webhook URL", docsUrl: "https://api.slack.com/messaging/webhooks" }],
    actions: ["send-slack-message"],
  },
  {
    id: "discord",
    name: "Discord",
    emoji: "🎮",
    what: "Post messages to a channel",
    secrets: [{ key: "DISCORD_WEBHOOK_URL", label: "Discord channel webhook URL", docsUrl: "https://support.discord.com/hc/en-us/articles/228383668" }],
    actions: ["send-discord-message"],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    emoji: "🟪",
    what: "Post messages to a channel",
    secrets: [{ key: "TEAMS_WEBHOOK_URL", label: "Teams incoming webhook / workflow URL" }],
    actions: ["send-teams-message"],
  },
  {
    id: "telegram",
    name: "Telegram",
    emoji: "✈️",
    what: "Send messages to a chat",
    secrets: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Telegram bot token", docsUrl: "https://core.telegram.org/bots#how-do-i-create-a-bot" },
      { key: "TELEGRAM_CHAT_ID", label: "Telegram chat id" },
    ],
    actions: ["send-telegram-message"],
  },
  {
    id: "email",
    name: "Email (SMTP)",
    emoji: "✉️",
    what: "Send emails",
    secrets: [
      { key: "SMTP_HOST", label: "SMTP host" },
      { key: "SMTP_USER", label: "SMTP user" },
      { key: "SMTP_PASSWORD", label: "SMTP password / app password" },
      { key: "SMTP_PORT", label: "SMTP port", optional: true },
      { key: "SMTP_FROM", label: "From address", optional: true },
      { key: "EMAIL_REDIRECT_TO", label: "Send every email to this inbox instead (demo safety)", optional: true },
    ],
    actions: ["send-email"],
  },
  {
    id: "notion",
    name: "Notion",
    emoji: "📝",
    what: "Create pages in a database",
    secrets: [
      { key: "NOTION_TOKEN", label: "Notion integration token", docsUrl: "https://developers.notion.com/docs/create-a-notion-integration" },
      { key: "NOTION_DATABASE_ID", label: "Notion database id" },
    ],
    actions: ["notion-create-page"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    emoji: "🧡",
    what: "Find and update contacts",
    secrets: [{ key: "HUBSPOT_TOKEN", label: "HubSpot private app token", docsUrl: "https://developers.hubspot.com/docs/api/private-apps" }],
    actions: ["hubspot-search-contacts", "hubspot-upsert-contact"],
  },
  {
    id: "stripe",
    name: "Stripe (test mode)",
    emoji: "💳",
    what: "Draft and send invoices (test keys only)",
    secrets: [{ key: "STRIPE_SECRET_KEY", label: "Stripe test secret key (sk_test_…)", docsUrl: "https://dashboard.stripe.com/test/apikeys" }],
    actions: ["stripe-create-invoice"],
  },
  {
    id: "sheets",
    name: "Google Sheets",
    emoji: "📊",
    what: "Read and update rows",
    secrets: [
      { key: "GOOGLE_SERVICE_ACCOUNT_JSON", label: "Google service account JSON (contents, base64, or path to the .json file)" },
      { key: "GOOGLE_SHEET_ID", label: "Default spreadsheet id" },
    ],
    actions: ["sheets-read-rows", "sheets-update-row", "sheets-append-row"],
  },
  {
    id: "github",
    name: "GitHub",
    emoji: "🐙",
    what: "Pull requests and issues",
    secrets: [
      { key: "GITHUB_TOKEN", label: "GitHub fine-grained token (Pull requests, Issues, Contents)" },
      { key: "GITHUB_REPO", label: "Default repository owner/name", optional: true },
    ],
    actions: ["github-list-prs", "github-read-pr", "github-review-pr", "github-create-issue"],
  },
  {
    id: "web",
    name: "Web search",
    emoji: "🔎",
    what: "Search the web and read pages",
    secrets: [
      { key: "TAVILY_API_KEY", label: "Tavily API key (optional, better results)", optional: true },
      { key: "BRAVE_SEARCH_API_KEY", label: "Brave Search API key (optional)", optional: true },
    ],
    actions: ["web-search", "read-web-page"],
    keyless: true,
  },
  {
    id: "webhook",
    name: "Webhooks",
    emoji: "🪝",
    what: "POST JSON to any allowed URL (Zapier, n8n, Make…)",
    secrets: [
      { key: "WEBHOOK_ENABLED", label: "Set to true to allow webhook calls" },
      { key: "WEBHOOK_ALLOWED_HOSTS", label: "Comma-separated allowed hosts (empty = any public host)", optional: true },
    ],
    actions: ["call-webhook"],
  },
];

let registered = false;
/** Make every connector key manageable in Settings → secrets. Deployment env vars of the same name also work. */
export function registerConnectorSecrets() {
  if (registered) return;
  registered = true;
  for (const c of CONNECTORS) {
    for (const s of c.secrets) {
      try {
        registerRequiredSecret({
          key: s.key,
          label: s.label,
          description: `${c.name}: ${c.what}.`,
          ...(s.docsUrl ? { docsUrl: s.docsUrl } : {}),
          scope: "workspace",
          kind: "api-key",
          required: false,
        });
      } catch {
        // Already registered (hot reload).
      }
    }
  }
}

/** Workspace secret from Settings first, then the deployment environment variable of the same name. */
export async function secret(key: string): Promise<string> {
  try {
    const detail = await resolveSecretDetailed(key);
    if (detail.value) return String(detail.value).trim();
  } catch {
    // Secret store unavailable (e.g. CLI); fall back to the environment.
  }
  return (process.env[key] ?? "").trim();
}

export async function requireSecret(key: string, connector: string): Promise<string> {
  const v = await secret(key);
  if (!v) {
    throw new HTTPError({
      status: 409,
      message: `${connector} is not connected: ${key} is missing. Ask the user to add it in Settings (or as an environment variable).`,
    });
  }
  return v;
}

export async function connectorStatus() {
  const { ACCOUNT_KEY, CONNECTOR_SIGNIN, signinEnv, signinReady } = await import("./oauth.js");
  const google = Boolean(await secret("GOOGLE_OAUTH_REFRESH_TOKEN"));
  return Promise.all(
    CONNECTORS.map(async (c) => {
      const required = c.secrets.filter((s) => !s.optional);
      const values = await Promise.all(required.map((s) => secret(s.key)));
      let connected = c.id === "webhook" ? values[0] === "true" : c.keyless ? true : values.every(Boolean);
      let missing = required.filter((_, i) => !values[i]).map((s) => s.key);
      // Signing in with Google covers email (Gmail) and the Sheets credential.
      if (c.id === "email" && !connected && google) {
        connected = true;
        missing = [];
      }
      if (c.id === "sheets" && google) {
        missing = missing.filter((k) => k !== "GOOGLE_SERVICE_ACCOUNT_JSON");
        connected = missing.length === 0;
      }
      const signin = CONNECTOR_SIGNIN[c.id] ?? null;
      const account = signin ? await secret(ACCOUNT_KEY[signin]) : "";
      return {
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        what: c.what,
        connected,
        missing,
        actions: c.actions,
        signin,
        signinReady: signin ? await signinReady(signin) : false,
        signinEnv: signin ? signinEnv(signin) : [],
        account,
        fields: await Promise.all(
          c.secrets.map(async (s) => ({
            key: s.key,
            label: s.label,
            optional: Boolean(s.optional),
            docsUrl: s.docsUrl ?? "",
            set: Boolean(await secret(s.key)),
          })),
        ),
      };
    }),
  );
}

/**
 * Per-skill tool grants. When an action runs on behalf of a skill (skillId given), the skill must list
 * the connector in its tools. Ad-hoc use from chat (no skillId) is allowed; sending still needs approval.
 */
export async function requireGrant(owner: string, skillId: string | undefined, tool: string) {
  if (!skillId) return;
  const skill = await getSkill(owner, skillId);
  if (!skill) throw new HTTPError({ status: 404, message: `Skill ${skillId} not found.` });
  if (!skill.tools.includes(tool)) {
    throw new HTTPError({
      status: 403,
      message: `The skill "${skill.name}" is not allowed to use ${tool}. Its tools: ${skill.tools.join(", ") || "none"}. Ask someone in its department to grant it.`,
    });
  }
}

export const TOOL_IDS = CONNECTORS.map((c) => c.id);
