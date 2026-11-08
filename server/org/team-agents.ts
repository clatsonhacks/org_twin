import { deleteResource, writeResource } from "@agent-native/core/resources";

import type { Department, Skill } from "../../shared/types.js";
import { getSnapshot } from "./store.js";

export const teamAgentPath = (deptId: string) => `agents/orgtwin-${deptId}.md`;

function yamlString(s: string) {
  return JSON.stringify(s.replace(/\s+/g, " ").trim());
}

function profile(dept: Department, skills: Skill[], company: string): string {
  const skillLines = skills.length
    ? skills
        .map((s) => {
          const steps = s.steps.map((st, i) => `   ${i + 1}. ${st.title}${st.detail ? ` — ${st.detail}` : ""}`).join("\n");
          return `- **${s.name}** (skillId \`${s.id}\`, saves ~${s.minutesSaved} min; tools: ${s.tools.join(", ") || "none"})\n  ${s.description}\n${steps}`;
        })
        .join("\n")
    : "- No skills yet. Do the work from the team's mission, and suggest a skill afterwards.";
  return `---
name: ${yamlString(`${dept.name} agent`)}
description: ${yamlString(
    `The ${dept.name} team's AI teammate at ${company}. ${dept.mission} Delegate ${dept.name} work to it: run steps owned by ${dept.name}, requests routed to ${dept.name}, and anything that uses its skills (${skills.map((s) => s.name).join(", ") || "none yet"}).`,
  )}
model: inherit
tools: inherit
delegate-default: false
---

# Role

You are the **${dept.name} agent** ${dept.emoji} in OrgTwin, the AI teammate of a ${dept.headcount}-person team at ${company}.
Mission: ${dept.mission || "(not set)"}
Roles on the team: ${dept.roles.map((r) => `${r.count}× ${r.title}`).join(", ") || "not listed"}.

# Your skills

${skillLines}

# How you work

- When you get a run step (runId + stepIndex): do the real work, then call \`complete-step\` with the work product
  and an honest \`minutesSaved\`. Follow the \`next\` hint; stop at approval steps (people approve on the map).
- When you get a team request: \`resolve-request\` with status "in_progress", do it with the matching skill, then
  \`resolve-request\` with status "done" and the result.
- Pass \`skillId\` to connector actions when you work for a skill; only use tools the skill is granted.
- Hand work to another team with \`handoff-to-team\` instead of doing their part.
- Never invent customer facts; mark assumptions clearly.
`;
}

/**
 * Keep one custom agent profile per department in agent resources, so each team is a real sub-agent
 * (@mention it, or let the main agent delegate to it). Non-fatal: the app works without them.
 */
export async function syncTeamAgents(owner: string, removedDepartmentIds: string[] = []): Promise<number> {
  try {
    for (const id of removedDepartmentIds) await deleteResource(teamAgentPath(id)).catch(() => {});
    const snap = await getSnapshot(owner);
    const company = snap.company?.name ?? "the company";
    for (const d of snap.departments) {
      await writeResource(teamAgentPath(d.id), profile(d, snap.skills.filter((s) => s.departmentId === d.id), company), {
        mimeType: "text/markdown",
      });
    }
    return snap.departments.length;
  } catch (error) {
    console.warn("[orgtwin] could not sync team agent profiles:", error instanceof Error ? error.message : error);
    return 0;
  }
}
