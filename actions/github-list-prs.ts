import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { gh, repoOf } from "../server/connectors/github.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "List pull requests of a GitHub repository.",
  schema: z.object({ repo: z.string().optional().describe("owner/name; defaults to GITHUB_REPO"), state: z.enum(["open", "closed", "all"]).default("open"), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  readOnly: true,
  run: async ({ repo, state, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "github");
    const r = await repoOf(repo);
    const prs = await gh<any[]>(`/repos/${r}/pulls?state=${state}&per_page=30`);
    return { repo: r, pulls: prs.map((p) => ({ number: p.number, title: p.title, author: p.user?.login, draft: p.draft, url: p.html_url, updated: p.updated_at })) };
  },
});
