import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, secret } from "../server/connectors/registry.js";
import { assertPublicUrl } from "../server/net.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "POST a JSON payload to a webhook (Zapier, n8n, Make, your own API). Needs WEBHOOK_ENABLED=true; WEBHOOK_ALLOWED_HOSTS limits where it can go. The user approves before it is sent.",
  schema: z.object({
    url: z.string().url(),
    payload: z.record(z.string(), z.unknown()),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ url, payload, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "webhook");
    if ((await secret("WEBHOOK_ENABLED")) !== "true") throw new Error("Webhooks are off. Set WEBHOOK_ENABLED=true to allow them.");
    const allowHttp = (await secret("WEBHOOK_ALLOW_HTTP")) === "true";
    const safe = await assertPublicUrl(url, { allowHttp });
    const allowed = (await secret("WEBHOOK_ALLOWED_HOSTS")).split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.some((h) => safe.hostname === h || safe.hostname.endsWith(`.${h}`))) {
      throw new Error(`${safe.hostname} is not in WEBHOOK_ALLOWED_HOSTS.`);
    }
    const res = await fetch(safe, {
      method: "POST",
      headers: { "content-type": "application/json", "User-Agent": "OrgTwin/1.0" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.text()).slice(0, 2000);
    return { status: res.status, ok: res.ok, response: body };
  },
});
