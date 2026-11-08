import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, secret } from "../server/connectors/registry.js";
import { httpJson } from "../server/connectors/http.js";
import { owner } from "./lib/owner.js";

type Hit = { title: string; url: string; snippet: string };

function decode(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

async function duckduckgo(query: string, n: number): Promise<Hit[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; OrgTwin/1.0)" },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await res.text();
  const hits: Hit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m; (m = re.exec(html)) && hits.length < n; ) {
    let url = m[1]!;
    const u = url.match(/uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]!);
    hits.push({ title: decode(m[2]!), url, snippet: decode(m[3]!) });
  }
  return hits;
}

export default defineAction({
  description: "Search the web. Returns titles, URLs and snippets; use read-web-page for a page's full text. Uses Tavily or Brave when a key is set, else a keyless engine.",
  schema: z.object({ query: z.string().min(2), maxResults: z.number().int().min(1).max(10).default(6), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  readOnly: true,
  run: async ({ query, maxResults, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "web");
    const tavily = await secret("TAVILY_API_KEY");
    if (tavily) {
      const r = await httpJson<{ results: Array<{ title: string; url: string; content: string }> }>(
        "https://api.tavily.com/search",
        { method: "POST", json: { api_key: tavily, query, max_results: maxResults } },
        "Tavily",
      );
      return { engine: "tavily", results: r.results.map((x) => ({ title: x.title, url: x.url, snippet: x.content.slice(0, 500) })) };
    }
    const brave = await secret("BRAVE_SEARCH_API_KEY");
    if (brave) {
      const r = await httpJson<{ web?: { results: Array<{ title: string; url: string; description: string }> } }>(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
        { headers: { "X-Subscription-Token": brave, Accept: "application/json" } },
        "Brave Search",
      );
      return { engine: "brave", results: (r.web?.results ?? []).map((x) => ({ title: x.title, url: x.url, snippet: decode(x.description) })) };
    }
    return { engine: "duckduckgo", results: await duckduckgo(query, maxResults) };
  },
});
