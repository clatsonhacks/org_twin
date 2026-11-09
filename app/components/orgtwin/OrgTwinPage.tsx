import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useOrgMembers, useOrgRole } from "@agent-native/core/client/org-team";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { Textarea } from "@agent-native/toolkit/ui/textarea";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

import type { OrgSnapshot } from "../../../shared/types";
import { askAgent } from "./agent";
import { OrgPanel, type PanelTab } from "./OrgPanel";
import { Avatar } from "./WorkspaceGate";
import { Stage3D } from "./Stage3D";

const PANELS: PanelTab[] = ["dept", "workflows", "runs", "requests", "connect"];

export default function OrgTwinPage() {
  useSetPageTitle("OrgTwin");
  const { data: org, isLoading, error } = useActionQuery<OrgSnapshot>("get-org", {});
  const [params, setParams] = useSearchParams();
  const deptId = params.get("dept");
  const panelParam = params.get("panel") as PanelTab | null;
  const tab: PanelTab = panelParam && PANELS.includes(panelParam) ? panelParam : "dept";

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading the company…</div>;
  }
  if (error || !org) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-red-600">
        Could not load the company: {String((error as Error | null)?.message ?? "unknown error")}
      </div>
    );
  }
  if (org.departments.length === 0) return <Onboarding />;

  const selected = org.departments.find((d) => d.id === deptId) ?? null;
  return (
    <div className="ot-root flex h-full min-h-0 flex-col">
      <Hud org={org} onTab={(t) => update({ panel: t === "dept" ? null : t })} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="ot-stage relative min-h-[320px] flex-1 overflow-hidden">
          <Stage3D
            org={org}
            selectedId={selected?.id ?? null}
            onSelect={(id) => update({ dept: id, panel: id ? null : params.get("panel"), ...(id ? {} : { inside: null }) })}
            inside={params.get("inside")}
            onInside={(id) => update({ inside: id, ...(id ? { dept: id, panel: null } : {}) })}
          />
          <Legend />
        </div>
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t bg-background md:w-[380px] md:border-l md:border-t-0">
          <OrgPanel
            org={org}
            tab={tab}
            selected={selected}
            onTab={(t) => update({ panel: t === "dept" ? null : t })}
            onSelectDept={(id) => update({ dept: id, panel: null })}
          />
        </aside>
      </div>
    </div>
  );
}

function Hud({ org, onTab }: { org: OrgSnapshot; onTab: (t: PanelTab) => void }) {
  const s = org.stats;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
      <div className="mr-2 min-w-0">
        <h1 className="truncate text-base font-semibold">{org.company?.name ?? "Your company"}</h1>
        {org.company?.description && (
          <p className="hidden truncate text-xs text-muted-foreground lg:block">{org.company.description}</p>
        )}
      </div>
      <Chip label="skills taught" value={org.skills.length} tone="indigo" />
      <Chip label="hours saved" value={s.hoursSaved} tone="emerald" />
      <Chip label="runs done" value={s.runsDone} tone="slate" />
      <button onClick={() => onTab("runs")} className="contents">
        <Chip label="approvals waiting" value={s.waitingApprovals} tone={s.waitingApprovals ? "amber" : "slate"} />
      </button>
      <AiAllowance />
      <div className="ml-auto flex items-center gap-2">
        <People />
        <Button size="sm" variant="outline" onClick={() => onTab("requests")}>
          📥 Ask a team
        </Button>
        <Button size="sm" variant="outline" onClick={() => onTab("workflows")}>
          🔀 Workflows
        </Button>
        <AgentToggleButton />
      </div>
    </div>
  );
}

/** Who is in this workspace, with a shortcut to invite more people. */
function People() {
  const { data } = useOrgMembers(0);
  const { canInviteMembers } = useOrgRole();
  const members = data?.members ?? [];
  return (
    <Link
      to="/team"
      className="group flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition-colors hover:bg-accent"
      title="Team: members and invitations"
    >
      <span className="flex -space-x-2">
        {members.slice(0, 4).map((m) => (
          <span key={m.email} className="rounded-full ring-2 ring-background">
            <Avatar name={m.name || m.email} image={m.image ?? null} size={24} />
          </span>
        ))}
      </span>
      <span className="text-muted-foreground group-hover:text-foreground">
        {canInviteMembers ? (members.length > 1 ? `${members.length} people · Invite` : "Invite your team") : `${members.length} people`}
      </span>
    </Link>
  );
}

/** Today's AI allowance for this person (limits protect the shared AI key; they reset at midnight UTC). */
function AiAllowance() {
  const { data } = useActionQuery<{
    turnsToday: number;
    limits: { dailyTurns: number };
    blocked: string | null;
  }>("get-ai-usage", {}, { refetchInterval: 60_000 });
  if (!data || !data.limits.dailyTurns) return null;
  const left = Math.max(0, data.limits.dailyTurns - data.turnsToday);
  return (
    <span title={data.blocked ?? "AI requests left today (resets at midnight UTC)"}>
      <Chip label="AI requests left today" value={left} tone={data.blocked || left <= 5 ? "amber" : "slate"} />
    </span>
  );
}

const TONES: Record<string, string> = {
  indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  slate: "bg-muted text-foreground",
};

function Chip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`flex items-baseline gap-1.5 rounded-full px-3 py-1 ${TONES[tone]}`}>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[11px]">{label}</span>
    </span>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 hidden flex-col gap-1 rounded-lg border bg-background/85 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur sm:flex">
      <span>▮ beam = hours AI has saved the team so far · click a building twice to step inside</span>
      <span>
        <span className="text-emerald-600">⚙</span> agent working · <span className="text-amber-600">!</span> needs your
        approval · <span className="text-sky-600">✉</span> request · 📦 handoff
      </span>
    </div>
  );
}

function Onboarding() {
  const [text, setText] = useState("");
  const sample = useActionMutation("load-sample-company");
  return (
    <div className="ot-root flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="text-5xl">🏝️</div>
          <h1 className="text-2xl font-semibold">Build your company's twin</h1>
          <p className="text-sm text-muted-foreground">
            Describe your company in a sentence. The agent turns it into a map: one building per team, each with an AI
            teammate, and shows where AI can give people hours back. Then you design and run cross-team work together.
          </p>
        </div>
        <div className="space-y-3 rounded-xl border bg-background p-4 shadow-sm">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. We're a 60-person dental clinic chain with 5 locations, a call centre, billing, marketing and a small IT team."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!text.trim()}
              onClick={() => askAgent(`Build the company twin for this company: ${text.trim()}`)}
            >
              ✦ Build my company
            </Button>
            <Button variant="outline" disabled={sample.isPending} onClick={() => sample.mutate({})}>
              {sample.isPending ? "Loading…" : "Try the sample company"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
