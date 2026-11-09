import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { hubspotToken } from "../server/connectors/oauth.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Search HubSpot contacts by name, email or company (up to 20).",
  schema: z.object({ query: z.string().min(1), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  readOnly: true,
  run: async ({ query, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "hubspot");
    const token = await hubspotToken();
    if (!token) await requireSecret("HUBSPOT_TOKEN", "HubSpot");
    const res = await httpJson<{ results: Array<{ id: string; properties: Record<string, string> }> }>(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        json: { query, limit: 20, properties: ["firstname", "lastname", "email", "company", "lifecyclestage", "hs_lead_status"] },
      },
      "HubSpot",
    );
    return { contacts: res.results.map((r) => ({ id: r.id, ...r.properties })) };
  },
});
