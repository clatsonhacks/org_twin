import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { notionSearch } from "../server/connectors/oauth.js";
import { requireSecret, secret } from "../server/connectors/registry.js";

export default defineAction({
  description:
    "List the Notion databases and pages shared with OrgTwin, and which database agents currently write to. Used by the Connect dialog to pick a database.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const token = await requireSecret("NOTION_TOKEN", "Notion");
    const [databases, pages] = await Promise.all([notionSearch(token, "database"), notionSearch(token, "page")]);
    return { databases, pages, current: (await secret("NOTION_DATABASE_ID")).replace(/-/g, "") };
  },
});
