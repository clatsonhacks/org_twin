# What's new

## Team agents, chat cards and automations
- Every department is now its own sub-agent, with a mission, skills and tool grants that stay in sync with the map. @mention one in chat ("@Finance agent, draft the invoice").
- Runs show up in chat as a card with **Approve** / **Reject** buttons, and the new team impact chart shows hours saved per team.
- A weekly digest posts hours saved, finished runs and waiting approvals to Slack or Discord every Monday.
- Automations can react to approval requests, finished runs and new requests.
- Actions open the exact team, run or request on the map, and teammates' changes appear live.

## Skill Recorder, connectors, MCP and A2A
- **Skill Recorder:** record your screen while you talk through a task, or upload a video. A Vultr vision model reads the keyframes and the agent turns them into a skill you can edit. The video never leaves your browser.
- **Connectors:** Slack, Discord, Microsoft Teams, Telegram, email, Notion, HubSpot, Stripe (test mode), Google Sheets, GitHub, web search and webhooks. Each skill lists which tools it may use, and every send waits for a person's approval.
- **Connect tab** shows which connectors are ready and which key each one still needs.
- **MCP and A2A:** every OrgTwin action is an MCP tool at `/mcp`, and teams hand work to each other as A2A tasks.

## The company map
- Describe your company in one sentence and get an island with one building per team, each with its own AI teammate.
- Teach skills, design cross-team workflows with approval steps, run them, and ask any team for work in plain language.
- AI runs on Vultr Serverless Inference.
