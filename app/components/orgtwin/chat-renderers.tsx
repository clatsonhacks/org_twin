import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { registerActionChatRenderer, type ToolRendererProps } from "@agent-native/toolkit/app/chat";
import { useState } from "react";

import type { OrgSnapshot, Run } from "../../../shared/types";
import { askAgent } from "./agent";

const ICON: Record<string, string> = { done: "✅", rejected: "⛔", waiting: "✋", active: "⚙️", pending: "○" };
const STATUS: Record<Run["status"], string> = {
  running: "Running",
  waiting_approval: "Waiting for approval",
  done: "Done",
  rejected: "Stopped",
};

/** Run progress card shown inside the agent chat, with Approve / Reject when the run waits for a person. */
function RunCard({ context }: ToolRendererProps) {
  const fromResult = (context.resultJson as { run?: Run } | null)?.run;
  const { data: org } = useActionQuery<OrgSnapshot>("get-org", {});
  // Prefer the live run (it moves on after approval); fall back to the tool result.
  const run = org?.runs.find((r) => r.id === fromResult?.id) ?? fromResult;
  const decide = useActionMutation("decide-approval");
  const [note, setNote] = useState("");
  if (!run) return null;
  const dept = (id: string) => org?.departments.find((d) => d.id === id);
  const minutes = run.steps.reduce((a, s) => a + (s.status === "done" ? s.minutesSaved : 0), 0);
  const waiting = run.status === "waiting_approval" ? run.steps[run.currentStep] : undefined;
  return (
    <div className="my-1 w-full max-w-[520px] space-y-2 rounded-xl border bg-background p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold">🔀 {run.name}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
            run.status === "waiting_approval"
              ? "bg-amber-500 text-white"
              : run.status === "done"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : run.status === "rejected"
                  ? "bg-red-500/15 text-red-700"
                  : "bg-muted"
          }`}
        >
          {STATUS[run.status]}
        </span>
      </div>
      <ol className="space-y-1">
        {run.steps.map((s, i) => {
          const d = dept(s.departmentId);
          return (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              <span>{ICON[s.status] ?? "○"}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d?.color ?? "#64748b" }} />
              <span className="text-muted-foreground">{d?.name ?? s.departmentId}</span>
              <span className={s.status === "active" || s.status === "waiting" ? "font-semibold" : undefined}>
                {s.title}
              </span>
              {i > 0 && run.steps[i - 1]!.departmentId !== s.departmentId && (
                <span className="text-[10px] text-muted-foreground" title="A2A handoff">
                  📦
                </span>
              )}
              {s.minutesSaved > 0 && <span className="ml-auto text-[10px] text-muted-foreground">{s.minutesSaved} min</span>}
            </li>
          );
        })}
      </ol>
      <div className="text-[11px] text-muted-foreground">⏱ {minutes} min saved so far</div>
      {waiting && (
        <div className="space-y-1.5 rounded-lg border border-amber-400 bg-amber-50 p-2 dark:bg-amber-950/40">
          <p className="text-xs">
            <strong>{dept(waiting.departmentId)?.name ?? "A person"}</strong> must approve “{waiting.title}”. Only people
            can approve; the agent waits.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="h-7 w-full rounded-md border bg-background px-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              disabled={decide.isPending}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              onClick={() =>
                decide.mutate(
                  { runId: run.id, approve: true, note },
                  {
                    onSuccess: () =>
                      askAgent(`I approved "${waiting.title}". Continue the run "${run.name}".`, `runId=${run.id}`),
                  },
                )
              }
            >
              ✓ Approve
            </button>
            <button
              disabled={decide.isPending}
              className="rounded-md border border-red-400 px-2.5 py-1 text-xs text-red-700 disabled:opacity-50"
              onClick={() => decide.mutate({ runId: run.id, approve: false, note })}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

let registered = false;
export function registerOrgTwinChatRenderers() {
  if (registered) return;
  registered = true;
  registerActionChatRenderer({ id: "orgtwin.run-card", renderer: "orgtwin.run-card", Component: RunCard });
}

registerOrgTwinChatRenderers();
