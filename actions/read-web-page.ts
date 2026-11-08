import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { assertPublicUrl } from "../server/net.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Fetch a public web page and return its readable text (first ~12k characters). Private network addresses are refused.",
  schema: z.object({ url: z.string().url(), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  readOnly: true,
  run: async ({ url, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "web");
    const safe = await assertPublicUrl(url, { allowHttp: true });
    const res = await fetch(safe, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OrgTwin/1.0)" }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      return { redirect: next ? new URL(next, safe).toString() : null, note: "The page redirects; call read-web-page again with the redirect URL." };
    }
    if (!res.ok) throw new Error(`The page returned HTTP ${res.status}.`);
    const html = (await res.text()).slice(0, 2_000_000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    const text = html
      .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim();
    return { url: safe.toString(), title, text: text.slice(0, 12000), truncated: text.length > 12000 };
  },
});
