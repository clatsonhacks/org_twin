import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Badge } from "@agent-native/toolkit/ui/badge";
import { Textarea } from "@agent-native/toolkit/ui/textarea";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { TOOL_OPTIONS, type Department, type OrgSnapshot, type Run, type Skill, type Workflow } from "../../../shared/types";
import { askAgent } from "./agent";
import { ConnectorsSection } from "./Connectors";
import { SkillRecorder } from "./SkillRecorder";

export type PanelTab = "dept" | "workflows" | "runs" | "requests" | "connect";

interface OrgPanelProps {
  org: OrgSnapshot;
  tab: PanelTab;
  selected: Department | null;
  onTab: (tab: PanelTab) => void;
  onSelectDept: (id: string) => void;
}

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "dept", label: "Department" },
  { id: "workflows", label: "Workflows" },
  { id: "runs", label: "Runs" },
  { id: "requests", label: "Requests" },
];

export function OrgPanel({ org, tab, selected, onTab, onSelectDept }: OrgPanelProps) {
  const waiting = org.stats.waitingApprovals;
  const openRequests = org.requests.filter((r) => r.status !== "done").length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`relative shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              tab === t.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.id === "runs" && waiting > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                {waiting}
              </span>
            )}
            {t.id === "requests" && openRequests > 0 && (
              <span className="ml-1.5 rounded-full bg-sky-500 px-1.5 text-[10px] font-semibold text-white">
                {openRequests}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        {tab === "dept" && <DeptTab org={org} dept={selected} onSelectDept={onSelectDept} />}
        {tab === "workflows" && <WorkflowsTab org={org} onShowRuns={() => onTab("runs")} />}
        {tab === "runs" && <RunsTab org={org} />}
        {tab === "requests" && <RequestsTab org={org} />}
        {tab === "connect" && <ConnectTab org={org} />}
      </div>
    </div>
  );
}

/* ---------------- Team ---------------- */

function DeptTab({
  org,
  dept,
  onSelectDept,
}: {
  org: OrgSnapshot;
  dept: Department | null;
  onSelectDept: (id: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  if (!dept) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Click a building on the map, or pick a team:</p>
        <div className="grid gap-2">
          {org.departments.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelectDept(d.id)}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-accent"
            >
              <span className="text-xl">{d.emoji}</span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{d.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {(() => {
                    const n = org.skills.filter((s) => s.departmentId === d.id).length;
                    return `${n} ${n === 1 ? "skill" : "skills"}`;
                  })()}
                  {(org.stats.savedMinutesByDept[d.id] ?? 0) > 0 && ` · ⏱ ${hours(org.stats.savedMinutesByDept[d.id]!)} h saved`}
                </span>
              </span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            </button>
          ))}
        </div>
      </div>
    );
  }
  const skills = org.skills.filter((s) => s.departmentId === dept.id);
  return (
    <div className="space-y-5">
      {recording && <SkillRecorder dept={dept} onClose={() => setRecording(false)} />}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{dept.emoji}</span>
          <h2 className="text-lg font-semibold">{dept.name}</h2>
          <span className="ml-auto h-3 w-3 rounded-full" style={{ background: dept.color }} />
        </div>
        {dept.mission && <p className="text-sm text-muted-foreground">{dept.mission}</p>}
      </header>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="people" value={dept.headcount} />
        <Stat label="hours saved" value={hours(org.stats.savedMinutesByDept[dept.id] ?? 0)} />
        <Stat label="skills" value={skills.length} />
      </div>
      {dept.roles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dept.roles.map((r) => (
            <Badge key={r.title} variant="secondary">
              {r.count}× {r.title}
            </Badge>
          ))}
        </div>
      )}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Skills of the {dept.name} agent</h3>
          <div className="flex gap-1.5">
          <Button size="xs" variant="outline" onClick={() => setRecording(true)}>
            🎬 Record
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              askAgent(
                `What repetitive work could AI take off the ${dept.name} team? Propose 3 concrete skills and save them.`,
                `Selected department: ${dept.name} (id ${dept.id}).`,
              )
            }
          >
            ✦ Suggest
          </Button>
          </div>
        </div>
        {skills.length === 0 && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No skills yet. Ask the agent to suggest some, or tell it a job this team does every week.
          </p>
        )}
        {skills.map((s) => (
          <SkillCard key={s.id} skill={s} dept={dept} />
        ))}
      </section>
      <TeachSkill dept={dept} />
    </div>
  );
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** "Usually takes ~N min by hand": an AI estimate people can correct in place. */
function MinutesEditor({
  value,
  onSave,
  saving,
}: {
  value: number | undefined;
  onSave: (minutes: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(value ?? ""));
          setEditing(true);
        }}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        title="AI estimate. Click to change it."
      >
        ⏱ Usually takes {value ? `~${value} min` : "?"} by hand <span className="underline">edit</span>
      </button>
    );
  }
  return (
    <form
      className="inline-flex items-center gap-1 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.round(Number(draft));
        if (Number.isFinite(n) && n >= 0 && n <= 600) onSave(n);
        setEditing(false);
      }}
    >
      ⏱ Usually takes
      <Input
        autoFocus
        type="number"
        min={0}
        max={600}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-6 w-16 px-1 text-xs"
        aria-label="Minutes by hand"
      />
      min
      <Button size="xs" type="submit" disabled={saving}>
        Save
      </Button>
      <Button size="xs" type="button" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-2 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

function SkillCard({ skill, dept }: { skill: Skill; dept: Department }) {
  const [open, setOpen] = useState(false);
  const del = useActionMutation("delete-skill");
  const save = useActionMutation("save-skill");
  return (
    <div className="rounded-lg border">
      <button className="flex w-full items-start gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        <span className="mt-0.5 text-sm">📘</span>
        <span className="flex-1">
          <span className="block text-sm font-medium">{skill.name}</span>
          <span className="block text-xs text-muted-foreground">
            ⏱ ~{skill.minutesSaved} min by hand · used {skill.timesUsed}×
            {skill.tools.length > 0 && ` · 🧰 ${skill.tools.join(", ")}`}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          {skill.description && <p className="text-xs text-muted-foreground">{skill.description}</p>}
          <MinutesEditor
            value={skill.minutesSaved}
            saving={save.isPending}
            onSave={(minutesSaved) =>
              save.mutate({
                id: skill.id,
                departmentId: skill.departmentId,
                name: skill.name,
                description: skill.description,
                steps: skill.steps,
                tools: skill.tools,
                minutesSaved,
              })
            }
          />
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            {skill.steps.map((st, i) => (
              <li key={i}>
                <span className="font-medium">{st.title}</span>
                {st.detail && <span className="text-muted-foreground"> — {st.detail}</span>}
              </li>
            ))}
          </ol>
          <SkillTools skill={skill} />
          <div className="flex gap-2 pt-1">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                askAgent(
                  `Improve the "${skill.name}" skill of ${dept.name}: make the steps more concrete and save it.`,
                  `Skill id ${skill.id}, department ${dept.id}.`,
                )
              }
            >
              ✦ Improve
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={del.isPending}
              onClick={() => {
                if (confirm(`Delete the skill "${skill.name}"?`)) del.mutate({ id: skill.id });
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillTools({ skill }: { skill: Skill }) {
  const save = useActionMutation("save-skill");
  const [mcp, setMcp] = useState("");
  const set = (tools: string[]) =>
    save.mutate({
      id: skill.id,
      departmentId: skill.departmentId,
      name: skill.name,
      description: skill.description,
      steps: skill.steps,
      minutesSaved: skill.minutesSaved,
      tools,
    });
  const toggle = (id: string) =>
    set(skill.tools.includes(id) ? skill.tools.filter((t) => t !== id) : [...skill.tools, id]);
  const mcpTools = skill.tools.filter((t) => t.startsWith("mcp:"));
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
      <p className="text-[11px] font-medium">🧰 Tools this skill may use</p>
      <div className="flex flex-wrap gap-1">
        {TOOL_OPTIONS.map((t) => {
          const on = skill.tools.includes(t.id);
          return (
            <button
              key={t.id}
              disabled={save.isPending}
              onClick={() => toggle(t.id)}
              aria-pressed={on}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "text-muted-foreground hover:bg-accent"}`}
            >
              {on ? "✓ " : ""}
              {t.label}
            </button>
          );
        })}
        {mcpTools.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className="rounded-full border border-sky-500 bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-800 dark:text-sky-200"
            title="Remove"
          >
            ✓ 🔌 {t.slice(4)}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const name = mcp.trim();
          if (name && !skill.tools.includes(`mcp:${name}`)) set([...skill.tools, `mcp:${name}`]);
          setMcp("");
        }}
      >
        <Input value={mcp} onChange={(e) => setMcp(e.target.value)} placeholder="MCP server or tool name" className="h-7 text-xs" />
        <Button size="xs" variant="outline" type="submit">
          + MCP
        </Button>
      </form>
    </div>
  );
}

function TeachSkill({ dept }: { dept: Department }) {
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState("");
  return (
    <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <h3 className="text-sm font-semibold">Teach a skill in your own words</h3>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`e.g. "Every Monday I pull last week's numbers and write a summary for the leads"`}
        rows={3}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Usually takes
          <Input
            type="number"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="AI"
            className="h-7 w-16 px-1.5 text-xs"
          />
          min by hand
        </label>
        <Button
          size="sm"
          className="ml-auto"
          disabled={!text.trim()}
          onClick={() => {
            const m = Math.round(Number(minutes));
            const time =
              m > 0
                ? `It usually takes a person ${m} minutes by hand (use minutesSaved=${m}).`
                : "Estimate honestly how many minutes it usually takes a person by hand and save that as minutesSaved.";
            askAgent(`Turn this into a skill for the ${dept.name} team and save it: ${text.trim()}\n\n${time}`, `Department id ${dept.id}.`);
            setText("");
            setMinutes("");
          }}
        >
          ✦ Save as skill
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Leave the minutes empty and the AI estimates them; you can change it later.</p>
    </section>
  );
}

/* ---------------- Workflows ---------------- */

function deptOf(org: OrgSnapshot, id: string) {
  return org.departments.find((d) => d.id === id);
}

function StepChips({ org, steps }: { org: OrgSnapshot; steps: Workflow["steps"] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {steps.map((s, i) => {
        const d = deptOf(org, s.departmentId);
        const handoff = i > 0 && steps[i - 1]!.departmentId !== s.departmentId;
        return (
          <li key={s.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-muted-foreground">{handoff ? "📦→" : "→"}</span>}
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] text-white"
              style={{ background: d?.color ?? "#64748b" }}
              title={`${d?.name ?? s.departmentId}: ${s.title}`}
            >
              {s.kind === "approval" ? "✋ " : ""}
              {s.title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function WorkflowsTab({ org, onShowRuns }: { org: OrgSnapshot; onShowRuns: () => void }) {
  const [idea, setIdea] = useState("");
  const [minutes, setMinutes] = useState("");
  const del = useActionMutation("delete-workflow");
  const busy = org.runs.some((r) => r.status === "running" || r.status === "waiting_approval");
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <h3 className="text-sm font-semibold">Describe a process across teams</h3>
        <Textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder={`e.g. "When marketing gets a webinar signup, sales qualifies it, and success books a demo"`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Usually takes
            <Input
              type="number"
              min={1}
              max={6000}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="AI"
              className="h-7 w-16 px-1.5 text-xs"
            />
            min per run
          </label>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!idea.trim()}
            onClick={() => {
              const m = Math.round(Number(minutes));
              const time =
                m > 0
                  ? `Done by hand it usually takes about ${m} minutes in total; split that across the steps as each step's minutes.`
                  : "Estimate honestly how many minutes each step usually takes a person by hand and save it as the step's minutes.";
              askAgent(`Design a cross-team workflow for this and save it: ${idea.trim()}\n\n${time}`);
              setIdea("");
              setMinutes("");
            }}
          >
            ✦ Design with the agent
          </Button>
        </div>
      </section>
      {org.workflows.length === 0 && <p className="text-sm text-muted-foreground">No workflows yet.</p>}
      {org.workflows.map((w) => (
        <article key={w.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <h3 className="text-sm font-semibold">{w.name}</h3>
              {w.goal && <p className="text-xs text-muted-foreground">{w.goal}</p>}
            </div>
          </div>
          <StepChips org={org} steps={w.steps} />
          <WorkflowTimes workflow={w} org={org} />
          <div className="flex gap-2 pt-1">
            <Button
              size="xs"
              disabled={busy}
              title={busy ? "Another run is in progress" : undefined}
              onClick={() => {
                askAgent(
                  `Run the workflow "${w.name}". Use a realistic example input if I didn't give one, and do every work step.`,
                  `workflowId=${w.id}`,
                );
                onShowRuns();
              }}
            >
              ▶ Run
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => askAgent(`Review the workflow "${w.name}" and suggest improvements.`, `workflowId=${w.id}`)}
            >
              ✦ Review
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete the workflow "${w.name}"?`)) del.mutate({ id: w.id });
              }}
            >
              Delete
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Total time a run takes by hand, and the per-step AI estimates people can correct. */
function WorkflowTimes({ workflow: w, org }: { workflow: Workflow; org: OrgSnapshot }) {
  const save = useActionMutation("save-workflow");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const known = w.steps.filter((s) => typeof s.minutes === "number");
  const total = known.reduce((a, s) => a + (s.minutes ?? 0), 0);
  const missing = w.steps.length - known.length;
  const persist = () => {
    save.mutate({
      id: w.id,
      name: w.name,
      goal: w.goal,
      steps: w.steps.map((s) => {
        const raw = draft[s.id];
        const n = raw === undefined || raw === "" ? s.minutes : Math.max(0, Math.min(600, Math.round(Number(raw))));
        return {
          id: s.id,
          departmentId: s.departmentId,
          kind: s.kind,
          title: s.title,
          instructions: s.instructions,
          ...(typeof n === "number" && Number.isFinite(n) ? { minutes: n } : {}),
        };
      }),
    });
    setOpen(false);
  };
  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <span>
          ⏱ {known.length ? `~${total} min by hand per run` : "No time estimate yet"}
          {known.length > 0 && missing > 0 && ` (${missing} step${missing > 1 ? "s" : ""} not estimated)`}
        </span>
        <button className="underline hover:text-foreground" onClick={() => setOpen(!open)}>
          {open ? "close" : "edit times"}
        </button>
        {missing > 0 && (
          <button
            className="underline hover:text-foreground"
            onClick={() =>
              askAgent(
                `Estimate honestly how many minutes each step of the workflow "${w.name}" usually takes a person by hand, and save them as the steps' minutes (keep everything else the same).`,
                `workflowId=${w.id}`,
              )
            }
          >
            ✦ AI estimate
          </button>
        )}
      </div>
      {open && (
        <form
          className="mt-2 space-y-1.5 rounded-md border bg-muted/30 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            persist();
          }}
        >
          {w.steps.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate" title={s.title}>
                {deptOf(org, s.departmentId)?.emoji} {s.title}
              </span>
              <Input
                type="number"
                min={0}
                max={600}
                value={draft[s.id] ?? s.minutes ?? ""}
                placeholder="?"
                onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })}
                className="h-6 w-16 px-1 text-xs"
                aria-label={`Minutes for ${s.title}`}
              />
              min
            </label>
          ))}
          <div className="flex justify-end gap-1 pt-1">
            <Button size="xs" type="submit" disabled={save.isPending}>
              Save times
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------------- Runs ---------------- */

function RunsTab({ org }: { org: OrgSnapshot }) {
  return (
    <div className="space-y-4">
      <DigestCard />
      {org.runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet. Press ▶ Run on a workflow.</p>}
      {org.runs.map((r, i) => (
        <RunCard key={r.id} org={org} run={r} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<Run["status"], string> = {
  running: "Running",
  waiting_approval: "Waiting for approval",
  done: "Done",
  rejected: "Stopped",
};

function RunCard({ org, run, defaultOpen }: { org: OrgSnapshot; run: Run; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const minutes = run.steps.reduce((a, s) => a + (s.status === "done" ? s.minutesSaved : 0), 0);
  return (
    <article className="rounded-lg border">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        <span className="flex-1">
          <span className="block text-sm font-semibold">{run.name}</span>
          <span className="block text-xs text-muted-foreground">
            {new Date(run.createdAt).toLocaleString()} · {minutes} min saved
          </span>
        </span>
        <Badge
          variant={run.status === "rejected" ? "destructive" : run.status === "done" ? "secondary" : "default"}
          className={run.status === "waiting_approval" ? "bg-amber-500 text-white" : undefined}
        >
          {STATUS_LABEL[run.status]}
        </Badge>
      </button>
      {open && (
        <ol className="space-y-2 border-t px-3 py-3">
          {run.input && (
            <li className="rounded-md bg-muted/50 p-2 text-xs">
              <span className="font-medium">Input:</span> {run.input}
            </li>
          )}
          {run.steps.map((s, i) => (
            <RunStepRow key={s.id} org={org} run={run} index={i} />
          ))}
          <A2AFeed org={org} runId={run.id} />
        </ol>
      )}
    </article>
  );
}

function RunStepRow({ org, run, index }: { org: OrgSnapshot; run: Run; index: number }) {
  const s = run.steps[index]!;
  const d = deptOf(org, s.departmentId);
  const [note, setNote] = useState("");
  const decide = useActionMutation("decide-approval");
  const icon =
    s.status === "done" ? "✅" : s.status === "rejected" ? "⛔" : s.status === "waiting" ? "✋" : s.status === "active" ? "⚙️" : "○";
  return (
    <li className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className={s.status === "active" ? "animate-spin" : undefined}>{icon}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: d?.color ?? "#64748b" }} />
        <span className="text-xs text-muted-foreground">{d?.name ?? s.departmentId}</span>
        <span className="font-medium">{s.title}</span>
      </div>
      {s.output && (
        <div className="ml-6 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs leading-relaxed">
          {s.output}
          {s.minutesSaved > 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground">⏱ ~{s.minutesSaved} min saved</div>
          )}
        </div>
      )}
      {s.status === "waiting" && (
        <div className="ml-6 space-y-2 rounded-md border border-amber-400 bg-amber-50 p-2 dark:bg-amber-950/40">
          <p className="text-xs">
            <strong>{d?.name ?? "This team"}</strong> needs to approve before the agent continues.{" "}
            {s.instructions}
          </p>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <div className="flex gap-2">
            <Button
              size="xs"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate(
                  { runId: run.id, approve: true, note },
                  {
                    onSuccess: () =>
                      askAgent(
                        `I approved "${s.title}". Continue the run "${run.name}".`,
                        `runId=${run.id}. Call get-run and do the next work step.`,
                      ),
                  },
                )
              }
            >
              ✓ Approve
            </Button>
            <Button
              size="xs"
              variant="outline-destructive"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ runId: run.id, approve: false, note })}
            >
              Reject
            </Button>
          </div>
          {decide.error && <p className="text-xs text-red-600">{String(decide.error.message)}</p>}
        </div>
      )}
      {s.decidedBy && (
        <p className="ml-6 text-[10px] text-muted-foreground">
          decided by {s.decidedBy}
          {s.note ? ` — "${s.note}"` : ""}
        </p>
      )}
    </li>
  );
}

/* ---------------- Requests ---------------- */

function RequestsTab({ org }: { org: OrgSnapshot }) {
  const [fromName, setFromName] = useState("");
  const [fromDept, setFromDept] = useState("");
  const [text, setText] = useState("");
  const create = useActionMutation("create-request");
  const del = useActionMutation("delete-request");
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <h3 className="text-sm font-semibold">📥 Ask a team</h3>
        <p className="text-xs text-muted-foreground">
          Ask for work in plain language. The agent finds the team and skill that fit, does it, and logs the answer.
        </p>
        <div className="flex gap-2">
          <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your name" />
          <select
            value={fromDept}
            onChange={(e) => setFromDept(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Your team"
          >
            <option value="">Your team</option>
            {org.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.emoji} {d.name}
              </option>
            ))}
          </select>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={`e.g. "I need an analysis of why customers churned in Q3"`}
        />
        <Button
          size="sm"
          disabled={!text.trim() || create.isPending}
          onClick={() =>
            create.mutate(
              { fromName: fromName.trim() || "Someone", fromDepartmentId: fromDept || undefined, text: text.trim() },
              {
                onSuccess: (req: any) => {
                  askAgent(
                    `New team request from ${fromName.trim() || "someone"}: "${text.trim()}". Route it to the right team and skill, do the work, and resolve it.`,
                    `requestId=${req?.id}`,
                  );
                  setText("");
                },
              },
            )
          }
        >
          Send request
        </Button>
      </section>
      {org.requests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
      {org.requests.map((r) => {
        const to = deptOf(org, r.departmentId);
        const from = deptOf(org, r.fromDepartmentId);
        const skill = org.skills.find((s) => s.id === r.skillId);
        return (
          <article key={r.id} className="space-y-1.5 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {r.fromName}
                {from ? ` · ${from.emoji} ${from.name}` : ""}
              </span>
              <span>→</span>
              <span>{to ? `${to.emoji} ${to.name}` : "routing…"}</span>
              <Badge variant={r.status === "done" ? "secondary" : "default"} className="ml-auto">
                {r.status === "in_progress" ? "in progress" : r.status}
              </Badge>
            </div>
            <p className="text-sm font-medium">{r.text}</p>
            {skill && <p className="text-xs text-muted-foreground">📘 {skill.name}</p>}
            {r.result && (
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs leading-relaxed">
                {r.result}
              </div>
            )}
            <div className="flex gap-2">
              {r.status !== "done" && (
                <Button size="xs" variant="outline" onClick={() => askAgent(`Handle the team request "${r.text}".`, `requestId=${r.id}`)}>
                  ✦ Handle
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => del.mutate({ id: r.id })}>
                Delete
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---------------- Weekly digest (recurring job) ---------------- */

interface DigestSchedule {
  exists: boolean;
  enabled?: boolean;
  schedule?: string | null;
  post?: string;
  lastRun?: string | null;
  lastStatus?: string | null;
}

function DigestCard() {
  const { data: job } = useActionQuery<DigestSchedule>("get-digest-schedule", {});
  const schedule = useActionMutation("schedule-weekly-digest");
  const preview = useActionMutation("weekly-digest");
  const [post, setPost] = useState<"slack" | "discord" | "none">("slack");
  const on = Boolean(job?.exists && job.enabled);
  return (
    <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">⏰ Weekly digest</h3>
        <span className={`ml-auto text-[11px] ${on ? "text-emerald-600" : "text-muted-foreground"}`}>
          {on ? `on · ${job?.post} · cron ${job?.schedule}` : "off"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        A recurring agent job: every Monday it sums up hours saved by team, finished runs, top skills and approvals
        that are waiting, and posts it to your channel.
        {job?.lastRun ? ` Last run ${new Date(job.lastRun).toLocaleString()} (${job.lastStatus}).` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={post}
          onChange={(e) => setPost(e.target.value as typeof post)}
          className="h-7 rounded-md border bg-background px-2 text-xs"
          aria-label="Post the digest to"
        >
          <option value="slack">Post to Slack</option>
          <option value="discord">Post to Discord</option>
          <option value="none">Don't post</option>
        </select>
        <Button size="xs" disabled={schedule.isPending} onClick={() => schedule.mutate({ enabled: !on, day: 1, hour: 9, post })}>
          {on ? "Turn off" : "Turn on (Mon 09:00)"}
        </Button>
        <Button size="xs" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate({ post: "none" })}>
          Preview
        </Button>
      </div>
      {preview.data && (
        <pre className="whitespace-pre-wrap rounded-md border bg-background p-2 text-[11px] leading-relaxed">
          {(preview.data as { text?: string }).text}
        </pre>
      )}
    </section>
  );
}

/* ---------------- A2A ---------------- */

function A2AFeed({ org, runId }: { org: OrgSnapshot; runId?: string }) {
  const msgs = org.messages.filter((m) => (runId ? m.runId === runId : true));
  if (msgs.length === 0) return null;
  return (
    <li className="space-y-1 border-t pt-2">
      <p className="text-[11px] font-semibold text-muted-foreground">A2A messages</p>
      {[...msgs].reverse().map((m) => {
        const from = deptOf(org, m.fromDepartmentId);
        const to = deptOf(org, m.toDepartmentId);
        return (
          <div key={m.id} className="rounded-md bg-muted/40 p-1.5 text-[11px]">
            <span className="font-medium">
              📦 {from?.name ?? "agent"} → {to?.name ?? m.toAgentUrl}
            </span>{" "}
            <span className="text-muted-foreground">{m.kind === "external" ? "(outside agent)" : "task"}</span>
            <div className="mt-0.5 line-clamp-2">{m.text}</div>
            {m.reply && <div className="mt-0.5 line-clamp-3 text-muted-foreground">↩ {m.reply}</div>}
          </div>
        );
      })}
    </li>
  );
}

/* ---------------- Connect ---------------- */

export function ConnectTab({ org }: { org: OrgSnapshot }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const external = org.messages.filter((m) => m.kind === "external");
  return (
    <div className="space-y-5">
      <ConnectorsSection />
      <Button size="xs" variant="outline" onClick={() => askAgent("Which connectors are connected, and which would help our teams most?")}>
        ✦ Which connectors would help us most?
      </Button>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">🧩 MCP</h3>
        <p className="text-xs text-muted-foreground">
          <strong>Use other apps:</strong> add a remote MCP server (Gmail, Linear, Jira, Zapier, your own…) from the
          chat's <kbd>+</kbd> menu; then grant it to a skill as <code>mcp:&lt;name&gt;</code>.
        </p>
        <p className="text-xs text-muted-foreground">
          <strong>Use OrgTwin from other AI tools:</strong> every OrgTwin action is an MCP tool (approvals stay
          people-only).
        </p>
        <CopyRow label="MCP endpoint" value={`${origin}/mcp`} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">🤝 A2A</h3>
        <p className="text-xs text-muted-foreground">
          Each team's agent hands work to the next team as an A2A task (see a run's messages). Outside agents can
          discover OrgTwin and send it tasks; OrgTwin's agent can call them too.
        </p>
        <CopyRow label="Agent card" value={`${origin}/.well-known/agent-card.json`} />
        <div className="flex flex-wrap gap-1.5">
          {org.departments.map((d) => (
            <Button
              key={d.id}
              size="xs"
              variant="outline"
              onClick={() => askAgent(`Show me the A2A agent card of the ${d.name} team and what work it can take.`, `departmentId=${d.id}`)}
            >
              {d.emoji} {d.name} card
            </Button>
          ))}
        </div>
        <ExternalAgentForm />
        {external.length > 0 && <A2AFeed org={{ ...org, messages: external }} />}
      </section>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate text-[11px]">{value}</code>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function ExternalAgentForm() {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-1.5 rounded-md border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        askAgent(`Send this to the outside A2A agent at ${url.trim()} and tell me its answer: ${text.trim()}`);
        setText("");
      }}
    >
      <p className="text-[11px] font-medium">Message an outside agent</p>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://other-agent.example.com" className="h-7 text-xs" />
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="What should it do?" className="h-7 text-xs" />
      <Button size="xs" type="submit" disabled={!url.trim() || !text.trim()}>
        Send via A2A
      </Button>
    </form>
  );
}
