import { getSnapshot } from "./store.js";

const DAY = 24 * 60 * 60 * 1000;

/** A deterministic weekly summary built from the database (no model involved). */
export async function buildDigest(owner: string, now = Date.now()) {
  const snap = await getSnapshot(owner);
  const since = now - 7 * DAY;
  const name = (id: string) => snap.departments.find((d) => d.id === id)?.name ?? id;
  const weekRuns = snap.runs.filter((r) => Date.parse(r.updatedAt) >= since);
  const minutesByTeam = new Map<string, number>();
  for (const r of weekRuns) {
    for (const s of r.steps) {
      if (s.status === "done" && s.finishedAt && Date.parse(s.finishedAt) >= since) {
        minutesByTeam.set(s.departmentId, (minutesByTeam.get(s.departmentId) ?? 0) + s.minutesSaved);
      }
    }
  }
  const weekRequests = snap.requests.filter((q) => Date.parse(q.createdAt) >= since);
  for (const q of weekRequests) {
    const skill = q.skillId ? snap.skills.find((s) => s.id === q.skillId) : undefined;
    if (q.status === "done" && q.departmentId && skill) {
      minutesByTeam.set(q.departmentId, (minutesByTeam.get(q.departmentId) ?? 0) + skill.minutesSaved);
    }
  }
  const totalHours = Math.round(([...minutesByTeam.values()].reduce((a, b) => a + b, 0) / 60) * 10) / 10;
  const waiting = snap.runs.filter((r) => r.status === "waiting_approval");
  const topSkills = [...snap.skills].sort((a, b) => b.timesUsed - a.timesUsed).filter((s) => s.timesUsed > 0).slice(0, 3);
  const openRequests = snap.requests.filter((q) => q.status !== "done");

  const lines = [
    `*OrgTwin weekly digest — ${snap.company?.name ?? "your company"}*`,
    `⏱ ${totalHours} h given back to people this week (${snap.stats.hoursSaved} h in total so far).`,
    `🔀 ${weekRuns.filter((r) => r.status === "done").length} workflow runs finished, ${weekRequests.length} team requests.`,
  ];
  if (minutesByTeam.size) {
    lines.push(
      "By team: " +
        [...minutesByTeam.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, m]) => `${name(id)} ${Math.round((m / 60) * 10) / 10} h`)
          .join(" · "),
    );
  }
  if (topSkills.length) lines.push(`📘 Most used skills: ${topSkills.map((s) => `${s.name} (${s.timesUsed}×)`).join(", ")}`);
  if (waiting.length) {
    lines.push(
      `✋ Waiting for approval: ` +
        waiting
          .map((r) => {
            const step = r.steps[r.currentStep]!;
            const hours = Math.round((now - Date.parse(r.updatedAt)) / 3_600_000);
            return `${r.name} → ${name(step.departmentId)} (${hours} h)`;
          })
          .join("; "),
    );
  }
  if (openRequests.length) lines.push(`📥 ${openRequests.length} open team request(s).`);
  return { text: lines.join("\n"), hoursSaved: totalHours, waitingApprovals: waiting.length, openRequests: openRequests.length };
}
