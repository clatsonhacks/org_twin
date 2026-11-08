import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { gh, repoOf } from "../server/connectors/github.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Post a review on a pull request: a comment or a request for changes. An agent never approves a PR. The user approves before it is posted.",
  schema: z.object({
    repo: z.string().optional().describe("owner/name; defaults to GITHUB_REPO"),
    number: z.number().int().min(1),
    body: z.string().min(1).max(60000),
    event: z.enum(["COMMENT", "REQUEST_CHANGES"]).default("COMMENT"),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ repo, number, body, event, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "github");
    const r = await repoOf(repo);
    const res = await gh(`/repos/${r}/pulls/${number}/reviews`, { method: "POST", json: { body, event } });
    return { posted: true, url: res.html_url };
  },
});
