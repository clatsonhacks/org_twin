import { readBody } from "@agent-native/core/server";
import { defineEventHandler, HTTPError } from "h3";

import { notionCreateDatabase, saveValues } from "../../../../connectors/oauth.js";
import { secret } from "../../../../connectors/registry.js";
import { asPerson, storeScopeFor } from "../../../../connectors/scope.js";

const NOTION_ID = /^[0-9a-f-]{32,36}$/i;

/** Pick the Notion database agents write to, or create an "OrgTwin" database inside a shared page. */
export default defineEventHandler(async (event) => {
  const body = (await readBody<{ databaseId?: string; createInPage?: string }>(event)) ?? {};
  const where = await storeScopeFor(event);
  return asPerson(where, async () => {
    const token = await secret("NOTION_TOKEN");
    if (!token) throw new HTTPError({ status: 409, message: "Connect Notion first." });
    let id = String(body.databaseId ?? "");
    let title = "";
    if (body.createInPage) {
      if (!NOTION_ID.test(body.createInPage)) throw new HTTPError({ status: 400, message: "Not a Notion page id." });
      try {
        const db = await notionCreateDatabase(token, body.createInPage);
        id = db.id;
        title = db.title;
      } catch (e) {
        throw new HTTPError({ status: 409, message: (e as Error).message });
      }
    }
    if (!NOTION_ID.test(id)) throw new HTTPError({ status: 400, message: "Pick a database." });
    await saveValues(where, { NOTION_DATABASE_ID: id });
    return { ok: true, message: title ? `Created the "${title}" database. Agents will add pages there.` : "Agents will add pages to that database." };
  });
});
