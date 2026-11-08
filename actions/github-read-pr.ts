import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { gh, repoOf } from "../server/connectors/github.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Read a pull request: description and the changed files with their diffs (truncated), ready for a review.",
  schema: z.object({ repo: z.string().optional().describe("owner/name; defaults to GITHUB_REPO"), number: z.number().int().min(1), skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"), }),
  readOnly: true,
  run: async ({ repo, number, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "github");
    const r = await repoOf(repo);
    const pr = await gh(`/repos/${r}/pulls/${number}`);
    const files = await gh<any[]>(`/repos/${r}/pulls/${number}/files?per_page=50`);
    let budget = 24000;
    return {
      title: pr.title,
      author: pr.user?.login,
      body: (pr.body ?? "").slice(0, 4000),
      url: pr.html_url,
      files: files.map((f) => {
        const patch = String(f.patch ?? "").slice(0, Math.max(0, Math.min(6000, budget)));
        budget -= patch.length;
        return { file: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch };
      }),
    };
  },
});
