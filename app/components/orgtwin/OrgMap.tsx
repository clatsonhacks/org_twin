import { useMemo } from "react";

import type { Department, OrgSnapshot, Run } from "../../../shared/types";
import { SLOTS, TH, TW, diamond, iso, shade } from "./iso";

interface Placed {
  dept: Department;
  x: number;
  y: number;
  gx: number;
  gy: number;
  height: number;
}

interface OrgMapProps {
  org: OrgSnapshot;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function activeRun(org: OrgSnapshot): Run | undefined {
  return org.runs.find((r) => r.status === "running" || r.status === "waiting_approval");
}

/** Isometric "company island": one building per department around an HQ plaza. */
export function OrgMap({ org, selectedId, onSelect }: OrgMapProps) {
  const placed = useMemo<Placed[]>(
    () =>
      org.departments.slice(0, SLOTS.length).map((dept, i) => {
        const [gx, gy] = SLOTS[i]!;
        const { x, y } = iso(gx, gy);
        return { dept, x, y, gx, gy, height: 34 + Math.min(dept.headcount, 20) * 4 };
      }),
    [org.departments],
  );
  const byId = useMemo(() => new Map(placed.map((p) => [p.dept.id, p])), [placed]);

  const run = activeRun(org);
  const step = run ? run.steps[run.currentStep] : undefined;
  const prev = run && run.currentStep > 0 ? run.steps[run.currentStep - 1] : undefined;
  const activeDept = step?.departmentId;
  const waitingDept = run?.status === "waiting_approval" ? step?.departmentId : undefined;
  const handoff =
    prev && step && prev.departmentId !== step.departmentId
      ? { from: byId.get(prev.departmentId), to: byId.get(step.departmentId) }
      : null;
  const requestDepts = new Set(
    org.requests.filter((r) => r.status === "in_progress" && r.departmentId).map((r) => r.departmentId),
  );
  const maxHours = Math.max(1, ...org.departments.map((d) => d.hoursAutomatable));

  const extent = placed.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      maxX: Math.max(acc.maxX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: -TW, maxX: TW, minY: -TH, maxY: TH },
  );
  const pad = 140;
  const vb = `${extent.minX - pad} ${extent.minY - pad - 120} ${extent.maxX - extent.minX + pad * 2} ${
    extent.maxY - extent.minY + pad * 2 + 120
  }`;

  const islandRadius = Math.max(3, ...placed.map((p) => Math.abs(p.gx) + Math.abs(p.gy))) + 1.6;
  const island = iso(0, 0);
  const drawOrder = [...placed].sort((a, b) => a.gx + a.gy - (b.gx + b.gy));

  return (
    <svg
      viewBox={vb}
      className="h-full w-full select-none"
      role="img"
      aria-label="Company map: one building per department"
      onClick={() => onSelect(null)}
    >
      <defs>
        <radialGradient id="ot-sea" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="var(--ot-sea-1)" />
          <stop offset="100%" stopColor="var(--ot-sea-2)" />
        </radialGradient>
        <linearGradient id="ot-beam" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* island */}
      <polygon
        points={diamond(island.x, island.y + 16, (islandRadius * TW) / 2, (islandRadius * TH) / 2)}
        fill="var(--ot-cliff)"
      />
      <polygon
        points={diamond(island.x, island.y, (islandRadius * TW) / 2, (islandRadius * TH) / 2)}
        fill="var(--ot-grass)"
      />

      {/* roads */}
      {placed.map((p) => (
        <line
          key={`road-${p.dept.id}`}
          x1={p.x}
          y1={p.y}
          x2={0}
          y2={0}
          stroke="var(--ot-road)"
          strokeWidth={14}
          strokeLinecap="round"
        />
      ))}

      {/* HQ plaza */}
      <polygon points={diamond(0, 0, TW * 0.42, TH * 0.42)} fill="var(--ot-plaza)" />
      <text x={0} y={5} textAnchor="middle" className="fill-foreground/70 text-[13px] font-semibold">
        {org.company?.name ?? "HQ"}
      </text>

      {/* handoff crate */}
      {handoff?.from && handoff.to && run && (
        <g key={`crate-${run.id}-${run.currentStep}`}>
          <path
            id="ot-handoff-path"
            d={`M ${handoff.from.x} ${handoff.from.y} L 0 0 L ${handoff.to.x} ${handoff.to.y}`}
            fill="none"
            stroke={handoff.to.dept.color}
            strokeWidth={3}
            strokeDasharray="6 8"
            className="ot-dash"
          />
          <g>
            <rect x={-9} y={-20} width={18} height={14} rx={2} fill="#b45309" stroke="#78350f" />
            <line x1={-9} y1={-13} x2={9} y2={-13} stroke="#78350f" />
            <animateMotion dur="2.4s" repeatCount="indefinite" rotate="0">
              <mpath href="#ot-handoff-path" />
            </animateMotion>
          </g>
        </g>
      )}

      {/* buildings, back to front */}
      {drawOrder.map((p) => (
        <Building
          key={p.dept.id}
          p={p}
          selected={selectedId === p.dept.id}
          active={activeDept === p.dept.id && run?.status === "running"}
          waiting={waitingDept === p.dept.id}
          hasRequest={requestDepts.has(p.dept.id)}
          beam={(p.dept.hoursAutomatable / maxHours) * 110}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}

function Building({
  p,
  selected,
  active,
  waiting,
  hasRequest,
  beam,
  onSelect,
}: {
  p: Placed;
  selected: boolean;
  active: boolean;
  waiting: boolean;
  hasRequest: boolean;
  beam: number;
  onSelect: (id: string) => void;
}) {
  const { x, y, height: h, dept } = p;
  const a = TW * 0.3;
  const b = TH * 0.3;
  const c = dept.color;
  const workers = Math.min(6, Math.max(1, dept.roles.reduce((n, r) => n + r.count, 0) || dept.headcount));
  const windows = Math.max(1, Math.floor((h - 14) / 16));

  return (
    <g
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(dept.id);
      }}
      role="button"
      aria-label={`${dept.name}: ${dept.headcount} people, ${dept.hoursAutomatable} hours a week automatable`}
    >
      {/* footprint / selection ring */}
      <polygon
        points={diamond(x, y, a + 18, b + 9)}
        fill={selected ? shade(c, 0.6) : "var(--ot-lot)"}
        stroke={selected ? c : "transparent"}
        strokeWidth={3}
      />
      {/* beacon: hours AI could save */}
      <g style={{ color: c }}>
        <rect x={x - 5} y={y - h - b - beam} width={10} height={beam} fill="url(#ot-beam)" />
      </g>
      {/* left face */}
      <polygon
        points={`${x - a},${y} ${x},${y + b} ${x},${y + b - h} ${x - a},${y - h}`}
        fill={shade(c, -0.18)}
      />
      {/* right face */}
      <polygon
        points={`${x},${y + b} ${x + a},${y} ${x + a},${y - h} ${x},${y + b - h}`}
        fill={shade(c, -0.36)}
      />
      {/* windows */}
      {Array.from({ length: windows }).map((_, i) => {
        const wy = y - 12 - i * 16;
        const lit = active || waiting;
        return (
          <g key={i} className={lit ? "ot-window-lit" : undefined}>
            <polygon
              points={`${x - a + 7},${wy + 3.5} ${x - 7},${wy + b - 3.5 + 0} ${x - 7},${wy + b - 11} ${x - a + 7},${wy - 4}`}
              fill={lit ? "#fde68a" : shade(c, 0.35)}
              opacity={lit ? 0.95 : 0.55}
            />
            <polygon
              points={`${x + 7},${wy + b - 3.5} ${x + a - 7},${wy + 3.5} ${x + a - 7},${wy - 4} ${x + 7},${wy + b - 11}`}
              fill={lit ? "#fcd34d" : shade(c, 0.15)}
              opacity={lit ? 0.9 : 0.45}
            />
          </g>
        );
      })}
      {/* roof */}
      <polygon points={diamond(x, y, a, b, h)} fill={shade(c, 0.22)} />
      <text x={x} y={y - h + 6} textAnchor="middle" fontSize={22}>
        {dept.emoji}
      </text>

      {/* workers */}
      {Array.from({ length: workers }).map((_, i) => {
        const wx = x - a - 8 + i * 9;
        const wy = y + b + 12 - (i % 2) * 6;
        return (
          <g key={`w${i}`} className={active ? "ot-busy" : undefined} style={{ animationDelay: `${i * 0.12}s` }}>
            <circle cx={wx} cy={wy - 9} r={3.2} fill="#fcd9b6" />
            <rect x={wx - 3} y={wy - 6} width={6} height={8} rx={2} fill={shade(c, -0.1)} />
          </g>
        );
      })}

      {/* label */}
      <g>
        <rect
          x={x - 62}
          y={y + b + 20}
          width={124}
          height={34}
          rx={8}
          className="fill-background/90 stroke-border"
        />
        <text x={x} y={y + b + 34} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
          {dept.name}
        </text>
        <text x={x} y={y + b + 48} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {dept.headcount} people · {dept.hoursAutomatable}h/wk AI
        </text>
      </g>

      {/* status bubbles */}
      {(waiting || active || hasRequest) && (
        <g className="ot-bob">
          <circle
            cx={x}
            cy={y - h - b - 26}
            r={14}
            fill={waiting ? "#f59e0b" : active ? "#22c55e" : "#0ea5e9"}
            stroke="white"
            strokeWidth={2}
          />
          <text x={x} y={y - h - b - 21} textAnchor="middle" fontSize={14} fontWeight={700} fill="white">
            {waiting ? "!" : active ? "⚙" : "✉"}
          </text>
        </g>
      )}
    </g>
  );
}
