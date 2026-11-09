import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { OrgSnapshot, Run } from "../../../shared/types";
import { OrgMap } from "./OrgMap";
import { toTeam } from "./world/model";
import type { Courier } from "./world/World";

const World = lazy(() => import("./world/World"));

interface Stage3DProps {
  org: OrgSnapshot;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  inside: string | null;
  onInside: (id: string | null) => void;
}

function activeRun(org: OrgSnapshot): Run | undefined {
  return org.runs.find((r) => r.status === "running" || r.status === "waiting_approval");
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The company as a voxel island (three.js); the flat map is the fallback without WebGL. */
export function Stage3D({ org, selectedId, onSelect, inside, onInside }: Stage3DProps) {
  const [mode, setMode] = useState<"pending" | "3d" | "flat">("pending");
  useEffect(() => setMode(webglAvailable() ? "3d" : "flat"), []);

  const teams = useMemo(() => org.departments.map(toTeam), [org.departments]);
  const skills = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of org.skills) out[s.departmentId] = (out[s.departmentId] ?? 0) + 1;
    return out;
  }, [org.skills]);

  const run = activeRun(org);
  const step = run ? run.steps[run.currentStep] : undefined;
  const activeTeam = run?.status === "running" ? (step?.departmentId ?? null) : null;
  const approvalTeams = run?.status === "waiting_approval" && step ? [step.departmentId] : [];
  const requestTeams = org.requests.filter((r) => r.status === "in_progress" && r.departmentId).map((r) => r.departmentId);
  const couriers = useCouriers(run);
  const [person, setPerson] = useState<string | null>(null);
  useEffect(() => setPerson(null), [inside]);

  const insideTeam = inside ? teams.find((t) => t.key === inside) : undefined;
  const flat = <OrgMap org={org} selectedId={selectedId} onSelect={onSelect} />;
  if (mode !== "3d") return mode === "flat" ? flat : null;

  return (
    <div className="ot3-stage absolute inset-0">
      <WebglBoundary fallback={flat}>
        <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-600">Building the island…</div>}>
          <World
            teams={teams}
            company={org.company?.name ?? ""}
            selectedTeam={selectedId}
            activeTeam={activeTeam}
            approvalTeams={approvalTeams}
            requestTeams={requestTeams}
            couriers={couriers}
            skills={skills}
            onSelectTeam={onSelect}
            inside={insideTeam ? inside : null}
            onEnter={(id) => {
              onSelect(id);
              onInside(id);
            }}
            selectedPerson={person}
            onSelectPerson={setPerson}
          />
        </Suspense>
      </WebglBoundary>
      {insideTeam && (
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <button className="ot3-hud-btn" onClick={() => onInside(null)}>
            ← Back to the island
          </button>
          <span className="ot3-sign ot3-sign-office hidden sm:block" style={{ ["--team" as string]: insideTeam.color }}>
            <b>
              {insideTeam.emoji} {insideTeam.name}
            </b>
            <span>{skills[insideTeam.key] ?? 0} skills · 📘 above a desk = a skill this team learned</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** A crate for every handoff: when a run moves to a step owned by another team, it travels between buildings. */
function useCouriers(run: Run | undefined): Courier[] {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const last = useRef<{ id: string; step: number } | null>(null);
  useEffect(() => {
    if (!run) {
      last.current = null;
      return;
    }
    const prev = last.current;
    last.current = { id: run.id, step: run.currentStep };
    if (!prev || prev.id !== run.id || prev.step === run.currentStep) return;
    const from = run.steps[prev.step];
    const to = run.steps[run.currentStep];
    if (!from || !to || from.departmentId === to.departmentId) return;
    const c: Courier = {
      id: `${run.id}-${run.currentStep}`,
      from: from.departmentId,
      to: to.departmentId,
      start: performance.now(),
      label: to.title,
    };
    setCouriers((list) => [...list.filter((x) => performance.now() - x.start < 4000), c]);
  }, [run]);
  return couriers;
}

class WebglBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
