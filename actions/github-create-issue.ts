import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { gh, repoOf } from "../server/connectors/github.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Open an issue in a GitHub repository. The user approves first.",
  schema: z.object({
    repo: z.string().optional().describe("owner/name; defaults to GITHUB_REPO"),
    title: z.string().min(1).max(250),
    body: z.string().default(""),
    labels: z.array(z.string()).default([]),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ repo, title, body, labels, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "github");
    const r = await repoOf(repo);
    const res = await gh(`/repos/${r}/issues`, { method: "POST", json: { title, body, labels } });
    return { number: res.number, url: res.html_url };
  },
});
