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
  routes it to the team and skill that fit, does it, and logs the answer.

Built with [Agent-Native](https://agent-native.com) for the Builder.io Agent-Native Hackathon. AI runs on
**Vultr Serverless Inference**.

## How it uses Agent-Native

| Piece | In OrgTwin |
|---|---|
| **Actions** (`actions/*.ts`, `defineAction`) | Every capability is defined once: `build-org`, `save-skill`, `save-workflow`, `start-run`, `complete-step`, `create-request`, `resolve-request`, … The map UI calls them with `useActionQuery` / `useActionMutation`; the agent calls the same ones as tools. They are also exposed over HTTP, MCP and the CLI. |
| **Human-only action** | `decide-approval` has `agentTool: false`, `mcpTool: false`, so no agent can approve its own work. |
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

The model can also be changed in the app's agent settings.

## Project layout

```
actions/              one file per capability (agent tool + UI call + HTTP + MCP)
server/db/            schema and migrations
server/org/store.ts   data access and the run state machine
server/org/sample.ts  the sample company
shared/types.ts       types shared by server and UI
app/components/orgtwin/  the map (OrgMap), side panel (OrgPanel) and page
AGENTS.md             the agent's instructions
```

## Licence

MIT
