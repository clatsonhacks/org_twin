import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { hubspotToken } from "../server/connectors/oauth.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Create or update a HubSpot contact by email (e.g. set lifecyclestage or hs_lead_status after qualifying a lead). The user approves first.",
  schema: z.object({
    email: z.string().email(),
    properties: z.record(z.string(), z.string()).describe("HubSpot contact properties, e.g. { firstname, company, hs_lead_status }"),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ email, properties, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "hubspot");
    const token = await hubspotToken();
    if (!token) await requireSecret("HUBSPOT_TOKEN", "HubSpot");
    const headers = { Authorization: `Bearer ${token}` };
    const found = await httpJson<{ results: Array<{ id: string }> }>(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      { method: "POST", headers, json: { filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], limit: 1 } },
      "HubSpot",
    );
    const id = found.results[0]?.id;
    const res = id
      ? await httpJson<{ id: string }>(`https://api.hubapi.com/crm/v3/objects/contacts/${id}`, { method: "PATCH", headers, json: { properties } }, "HubSpot")
      : await httpJson<{ id: string }>("https://api.hubapi.com/crm/v3/objects/contacts", { method: "POST", headers, json: { properties: { ...properties, email } } }, "HubSpot");
    return { id: res.id, created: !id };
  },
});
