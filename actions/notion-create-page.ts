import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { owner } from "./lib/owner.js";

const NOTION = "https://api.notion.com/v1";

export default defineAction({
  description: "Create a page in the connected Notion database with a title and markdown-ish text content. The user approves first.",
  schema: z.object({
    title: z.string().min(1).max(200),
    content: z.string().default("").describe("Paragraphs separated by blank lines; lines starting with '- ' become bullets"),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ title, content, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "notion");
    const token = await requireSecret("NOTION_TOKEN", "Notion");
    const databaseId = await requireSecret("NOTION_DATABASE_ID", "Notion");
    const headers = { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" };
    const db = await httpJson<{ properties: Record<string, { type: string }> }>(`${NOTION}/databases/${databaseId}`, { headers }, "Notion");
    const titleProp = Object.entries(db.properties).find(([, p]) => p.type === "title")?.[0] ?? "Name";
    const rich = (t: string) => [{ type: "text", text: { content: t.slice(0, 1900) } }];
    const children = content
      .split(/\n{2,}|\n(?=- )/)
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 90)
      .map((b) =>
        b.startsWith("- ")
          ? { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(b.slice(2)) } }
          : { object: "block", type: "paragraph", paragraph: { rich_text: rich(b) } },
      );
    const page = await httpJson<{ id: string; url: string }>(
      `${NOTION}/pages`,
      { method: "POST", headers, json: { parent: { database_id: databaseId }, properties: { [titleProp]: { title: rich(title) } }, children } },
      "Notion",
    );
    return { created: true, url: page.url, id: page.id };
  },
});
