# OrgTwin

**Your company as a living map, where people and AI agents work together.**

Describe your company in one sentence. OrgTwin's agent turns it into an island: one building per team,
each with its own AI teammate, and a beam on every building showing how many hours a week AI could take
off that team. Then you and the agent work on the same map:

- **Teach skills.** Click a team and ask "what could AI do here?", or describe a weekly job in your own
  words. The agent saves it as a skill with concrete steps.
- **Design cross-team workflows.** "When a lead comes in, Sales qualifies it, Finance invoices it after
  approval, Customer Success onboards the customer." The agent splits it into steps per team, with
  approval steps before anything risky.
- **Run them together.** Press ▶ Run. The agent does each step and writes the real output (the email,
  the invoice lines, the onboarding plan). The team's building lights up while it works, and a crate
  travels between buildings at every handoff.
- **Stay in control.** At an approval step the run stops and the building shows a "!". Only a person can
  approve: the approval action is hidden from the agent. After you approve, the agent carries on.
- **Ask a team.** Anyone can ask for work in plain language ("I need an analysis of Q3 churn"). The agent
  routes it to the team and skill that fit, does it, logs the answer and can ping the team on Slack/Discord.
- **🎬 Skill Recorder: show it once.** Record your screen while talking through a task (or upload a video).
  Keyframes are picked in the browser only when the screen changes, a **Vultr vision model** describes them,
  and the agent turns that plus your narration into a skill you can edit. The video never leaves the browser.
- **🔌 Connectors with per-skill grants.** Slack, Discord, Microsoft Teams, Telegram, email (SMTP), Notion,
  HubSpot, Stripe (test mode), Google Sheets, GitHub (PR reviews, issues), web search + page reading, and
  webhooks. Each skill lists the tools it may use; every send waits for a person's approval.
- **🧩 MCP both ways.** Add any remote MCP server (Gmail, Linear, Jira, Zapier…) from the chat's + menu and
  grant it to a skill as `mcp:<name>`. And every OrgTwin action is itself an MCP tool at `/mcp`.
- **🤖 A team of agents.** One OrgTwin agent plus one sub-agent per department, each with its own skills and
  tool grants. Delegate to them or @mention them ("@Finance agent, draft the invoice").
- **⏰ Weekly digest + automations.** A recurring job posts hours saved, finished runs and waiting approvals to
  Slack/Discord every Monday; events let you add "whenever an approval is requested, ping #finance".
- **🤝 A2A.** Each team's agent hands work to the next as an A2A task, visible in every run. OrgTwin publishes
  an agent card at `/.well-known/agent-card.json`, and its agent can message outside A2A agents.

Built with [Agent-Native](https://agent-native.com) for the Builder.io Agent-Native Hackathon. AI runs on
**Vultr Serverless Inference**.

## Workspaces and team

After signing in, people join their company's **workspace** (an invitation from an admin, or their email domain)
or create a new one. Everyone in a workspace shares one company map, skills, workflows, runs and approvals.
The sidebar has the **Company map**, **Knowledge graph** (teams → roles and skills → tools, workflows across
teams), **Team** (members, invitations, roles, join-by-domain) and **Connectors**. Set `AUTO_CREATE_DEFAULT_ORG=0`
in production so new people choose a workspace instead of getting a personal one.

## How it uses Agent-Native

| Piece | In OrgTwin |
|---|---|
| **Actions** (`actions/*.ts`, `defineAction`) | Every capability is defined once: `build-org`, `save-skill`, `save-workflow`, `start-run`, `complete-step`, `create-request`, `resolve-request`, … The map UI calls them with `useActionQuery` / `useActionMutation`; the agent calls the same ones as tools. They are also exposed over HTTP, MCP and the CLI. |
| **Human-only actions** | `decide-approval` and `observe-recording` have `agentTool: false`, `mcpTool: false`: no agent can approve its own work. |
| **Human-in-the-loop sends** | Every connector action that sends or changes something outside uses `needsApproval: true`, so the chat pauses for the user. |
| **Secrets** | Connector keys are registered with `registerRequiredSecret` (managed in Settings) and resolved server-side; deployment env vars of the same name also work. |
| **Sub-agent teams** | Every department is a custom agent profile (`agents/orgtwin-<team>.md`) with its mission, skills and tool grants, regenerated whenever the org changes. The main agent delegates team work to it; people can @mention it. |
| **Native chat UI** | A custom `orgtwin.run-card` renderer shows run progress in chat, with Approve/Reject buttons that call the people-only action. `team-impact` uses the built-in chart widget. |
| **Recurring jobs + events** | The weekly digest is a framework recurring job (`jobs/orgtwin-weekly-digest.md`). OrgTwin registers `orgtwin.approval.requested`, `orgtwin.run.completed` and `orgtwin.request.created` on the event bus for automations. |
| **Deep links** | Actions declare `link`, so MCP hosts and the desktop app can open the exact team, run or request on the map. |
| **Realtime sync** | The map opts into `useDbSync` realtime: approvals by teammates and job results appear without a refresh. |
| **MCP + A2A** | The framework mounts `/mcp` and the A2A endpoint; OrgTwin adds team agent cards, A2A handoff records and `call-external-agent`. |
| **Shared SQL** | Departments, skills, workflows, runs and requests live in the app database (PGlite locally, Postgres in production). |
| **Live sync** | When the agent saves a skill or finishes a step, the map updates without a refresh. |
| **Context awareness** | The selected team is the URL parameter `?dept=`, the open tab is `?panel=`. The agent sees both and moves the map with `set-search-params` when it talks about a team. `view-screen` gives it the selected team's details and the active run. |
| **UI → agent** | Buttons such as ✦ Suggest skills, ▶ Run, ✓ Approve and Send request hand work to the agent with `sendToAgentChat`, with the ids as hidden context. |
| **Agent instructions** | `AGENTS.md` tells the agent its job, the run protocol (do the step, record the real output, stop at approvals) and the app state. |

## Run it

Requires Node.js ≥ 22.22 and pnpm (`corepack enable`).

```bash
pnpm install
cp .env.example .env      # add your Vultr Serverless Inference key
pnpm dev                  # http://localhost:8080 → choose "Continue as local dev"
```

Open **Home**: describe your company, or press **Try the sample company** (Northwind Robotics, 6 teams,
8 skills, 2 workflows).

### AI models: Vultr Serverless Inference

Vultr's inference API is OpenAI-compatible, so OrgTwin uses the framework's OpenAI engine pointed at Vultr:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | Your Vultr Serverless Inference subscription key |
| `OPENAI_BASE_URL` | `https://api.vultrinference.com/v1` |
| `AGENT_ENGINE` | `ai-sdk:openai` |
| `AGENT_ENGINE_PREFER_BYO_KEY` | `true` |
| `AGENT_MODEL` | A chat model from `GET /v1/models`, e.g. `qwen3.8-27b` |
| `VULTR_VISION_MODEL` | Vision model for the Skill Recorder, e.g. `mimo-v2.6-pro` (auto-detected if unset) |

The Vultr names also work on their own: if `VULTR_INFERENCE_API_KEY` (+ `VULTR_INFERENCE_BASE_URL`,
`VULTR_INFERENCE_MODEL`) is set, OrgTwin maps it to the OpenAI-compatible settings above at startup.
The model can also be changed in the app's agent settings.

### Connector keys

Add them in **Settings** or as environment variables (same names): `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`,
`TEAMS_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, `SMTP_HOST/PORT/USER/PASSWORD/FROM` (+
`EMAIL_REDIRECT_TO` to send every email to one inbox while demoing), `NOTION_TOKEN` + `NOTION_DATABASE_ID`,
`HUBSPOT_TOKEN`, `STRIPE_SECRET_KEY` (test keys only), `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SHEET_ID`,
`GITHUB_TOKEN` (+ `GITHUB_REPO`), `TAVILY_API_KEY` or `BRAVE_SEARCH_API_KEY` (optional), `WEBHOOK_ENABLED=true`
(+ `WEBHOOK_ALLOWED_HOSTS`, `WEBHOOK_ALLOW_HTTP`). Anything missing stays in demo mode and the Connect tab says
which key is needed.

### One-click Connect

Every connector card in the **Connect** tab has a **Connect** button. For Google (Sheets + Gmail), Stripe (test
mode), Notion, Slack, Discord and HubSpot it opens the service's own sign-in popup; people click **Allow** and
nothing is copied. Telegram connects by pressing **Start** on the bot. The token is saved encrypted under the same
key the connector already reads (org owners/admins save it for the workspace, other members for themselves), and
**Disconnect** revokes it where the service allows. Without a sign-in, the dialog falls back to pasting a key.

To turn sign-in on, register OrgTwin once with each service and set its client id and secret (`.env` or Settings):
`GOOGLE_OAUTH_CLIENT_ID/SECRET`, `STRIPE_CONNECT_CLIENT_ID/SECRET_KEY`, `NOTION_OAUTH_CLIENT_ID/SECRET`,
`SLACK_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`, `HUBSPOT_CLIENT_ID/SECRET`. The redirect URI is
`<app address>/api/oauth/<service>/callback` (for example `http://localhost:8080/api/oauth/google/callback`);
the Connect dialog shows the exact address. Slack (and sometimes Notion) only accept `https` addresses.

## Project layout

```
actions/              one file per capability (agent tool + UI call + HTTP + MCP)
server/db/            schema and migrations
server/org/store.ts   data access and the run state machine
server/org/sample.ts  the sample company
shared/types.ts       types shared by server and UI
app/components/orgtwin/  the page, side panel (OrgPanel), Connect dialog (Connectors) and flat fallback map (OrgMap)
app/components/orgtwin/world/  the 3D voxel island and the offices inside each building (three.js)
server/connectors/oauth.ts  one-click Connect: sign-in popups, token storage, Gmail, Telegram
AGENTS.md             the agent's instructions
```

## Licence

MIT
