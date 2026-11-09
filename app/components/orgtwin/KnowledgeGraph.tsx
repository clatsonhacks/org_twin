import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { IconFocus2, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";

import { TOOL_OPTIONS, type OrgSnapshot } from "../../../shared/types";
import { askAgent } from "./agent";

/** The company as a knowledge graph: teams → roles and skills → the tools skills may use, and workflows across teams. */

type Kind = "org" | "team" | "role" | "skill" | "tool" | "workflow";
interface GNode {
  id: string;
  kind: Kind;
  label: string;
  sub?: string;
  color: string;
  x: number;
  y: number;
  a: number;
  ref?: string;
}
interface GEdge {
  from: string;
  to: string;
  kind: "has" | "uses" | "step";
}

const R = { workflow: 95, team: 210, role: 350, skill: 470, tool: 620 };
const SKILL = "#7c3aed";
const TOOL = "#0f766e";
const WORKFLOW = "#d97706";
const TOOL_LABEL = Object.fromEntries(TOOL_OPTIONS.map((t) => [t.id, t.label]));

function polar(r: number, a: number) {
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export function buildGraph(org: OrgSnapshot) {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const add = (n: Omit<GNode, "x" | "y">, r: number) => nodes.push({ ...n, ...polar(r, n.a) });
  add({ id: "org", kind: "org", label: org.company?.name ?? "Company", color: "#111827", a: 0 }, 0);

  const depts = org.departments;
  const weight = (id: string) => {
    const d = depts.find((x) => x.id === id)!;
    return Math.max(1, d.roles.length, org.skills.filter((s) => s.departmentId === id).length);
  };
  const total = depts.reduce((s, d) => s + weight(d.id) + 0.8, 0) || 1;
  const unit = (Math.PI * 2) / total;
  const teamAngle: Record<string, number> = {};
  let a = -Math.PI / 2;
  for (const d of depts) {
    const w = weight(d.id);
    const start = a + 0.4 * unit;
    const mid = start + (w * unit) / 2;
    teamAngle[d.id] = mid;
    add({ id: `team:${d.id}`, kind: "team", label: `${d.emoji} ${d.name}`, sub: `${d.headcount} people · ${d.hoursAutomatable} h/wk AI`, color: d.color, a: mid, ref: d.id }, R.team);
    edges.push({ from: "org", to: `team:${d.id}`, kind: "has" });
    d.roles.forEach((r, i) => {
      const ra = start + ((i + 0.5) * w * unit) / Math.max(1, d.roles.length);
      add({ id: `role:${d.id}:${i}`, kind: "role", label: r.title, sub: `${r.count} ${r.count === 1 ? "person" : "people"}`, color: d.color, a: ra, ref: d.id }, R.role);
      edges.push({ from: `team:${d.id}`, to: `role:${d.id}:${i}`, kind: "has" });
    });
    const skills = org.skills.filter((s) => s.departmentId === d.id);
    skills.forEach((s, i) => {
      const sa = start + ((i + 0.5) * w * unit) / Math.max(1, skills.length);
      add({ id: `skill:${s.id}`, kind: "skill", label: s.name, sub: `saves ~${s.minutesSaved} min · used ${s.timesUsed}×`, color: SKILL, a: sa, ref: s.id }, R.skill);
      edges.push({ from: `team:${d.id}`, to: `skill:${s.id}`, kind: "has" });
    });
    a = start + w * unit + 0.4 * unit;
  }

  // Tools sit at the average angle of the skills that may use them.
  const toolUsers: Record<string, number[]> = {};
  for (const s of org.skills) {
    const node = nodes.find((n) => n.id === `skill:${s.id}`);
    if (!node) continue;
    for (const t of s.tools) {
      (toolUsers[t] ??= []).push(node.a);
      edges.push({ from: `skill:${s.id}`, to: `tool:${t}`, kind: "uses" });
    }
  }
  const meanAngle = (as: number[]) => Math.atan2(as.reduce((s, x) => s + Math.sin(x), 0), as.reduce((s, x) => s + Math.cos(x), 0));
  const toolAngles = Object.entries(toolUsers)
    .map(([t, as]) => ({ t, a: meanAngle(as) }))
    .sort((p, q) => p.a - q.a);
  const minGap = 0.16;
  for (let i = 1; i < toolAngles.length; i++) {
    if (toolAngles[i]!.a - toolAngles[i - 1]!.a < minGap) toolAngles[i]!.a = toolAngles[i - 1]!.a + minGap;
  }
  for (const { t, a: ta } of toolAngles) {
    const label = TOOL_LABEL[t] ?? (t.startsWith("mcp:") ? `🧩 ${t.slice(4)}` : t);
    add({ id: `tool:${t}`, kind: "tool", label, sub: `${toolUsers[t]!.length} skill(s) may use it`, color: TOOL, a: ta, ref: t }, R.tool);
  }

  // Workflows in the middle, linked to every team they pass through.
  org.workflows.forEach((w, i) => {
    const teams = [...new Set(w.steps.map((s) => s.departmentId))].filter((t) => teamAngle[t] !== undefined);
    const wa = teams.length ? meanAngle(teams.map((t) => teamAngle[t]!)) : (i / Math.max(1, org.workflows.length)) * Math.PI * 2;
    const offset = (i - (org.workflows.length - 1) / 2) * 0.25;
    add({ id: `wf:${w.id}`, kind: "workflow", label: w.name, sub: `${w.steps.length} steps · ${teams.length} teams`, color: WORKFLOW, a: wa + offset, ref: w.id }, R.workflow);
    for (const t of teams) edges.push({ from: `wf:${w.id}`, to: `team:${t}`, kind: "step" });
  });

  return { nodes, edges, byId: Object.fromEntries(nodes.map((n) => [n.id, n])) as Record<string, GNode> };
}

function neighbourhood(id: string, edges: GEdge[]) {
  const set = new Set([id]);
  for (const e of edges) {
    if (e.from === id) set.add(e.to);
    if (e.to === id) set.add(e.from);
  }
  // Teams also light up their whole subtree.
  if (id.startsWith("team:")) {
    for (const e of edges) if (e.from === id) for (const f of edges) if (f.from === e.to) set.add(f.to);
  }
  return set;
}

export function KnowledgeGraph() {
  useSetPageTitle("Knowledge graph");
  const { data: org } = useActionQuery<OrgSnapshot>("get-org", {});
  const navigate = useNavigate();
  const graph = useMemo(() => (org ? buildGraph(org) : null), [org]);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const fit = useMemo(() => {
    if (!graph?.nodes.length) return { x: -700, y: -700, w: 1400 };
    const xs = graph.nodes.map((n) => n.x);
    const ys = graph.nodes.map((n) => n.y);
    const pad = 170;
    const w = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + pad * 2;
    return { x: (Math.max(...xs) + Math.min(...xs)) / 2 - w / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 - w / 2, w };
  }, [graph]);
  const [view, setView] = useState(fit);
  useEffect(() => setView(fit), [fit]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (!org || !graph) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!org.departments.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">🕸️</div>
        <p className="text-sm text-muted-foreground">The graph appears once your company has teams.</p>
        <Button asChild size="sm">
          <Link to="/home">Build the company</Link>
        </Button>
      </div>
    );
  }

  const focus = sel ?? hover;
  const lit = focus ? neighbourhood(focus, graph.edges) : null;
  const on = (id: string) => !lit || lit.has(id);
  const zoom = (f: number, cx?: number, cy?: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    setView((v) => {
      const side = Math.min(r.width, r.height);
      const scale = v.w / side;
      const px = v.x + ((cx ?? r.left + r.width / 2) - r.left - (r.width - side) / 2) * scale;
      const py = v.y + ((cy ?? r.top + r.height / 2) - r.top - (r.height - side) / 2) * scale;
      const w = Math.max(300, Math.min(4000, v.w * f));
      return { w, x: px - (px - v.x) * (w / v.w), y: py - (py - v.y) * (w / v.w) };
    });
  };
  const s = sel ? graph.byId[sel] : null;
  const counts = {
    teams: org.departments.length,
    skills: org.skills.length,
    tools: graph.nodes.filter((n) => n.kind === "tool").length,
    workflows: org.workflows.length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="relative min-h-[360px] flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,var(--ot-sea-1),transparent_70%)]">
        <svg
          ref={svg}
          className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.w}`}
          role="img"
          aria-label="Knowledge graph of the company"
          onWheel={(e) => zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY)}
          onPointerDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false })}
          onPointerMove={(e) => {
            const d = drag.current;
            const r = svg.current?.getBoundingClientRect();
            if (!d || !r) return;
            if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
            const scale = view.w / Math.min(r.width, r.height);
            const x = d.vx - (e.clientX - d.x) * scale;
            const y = d.vy - (e.clientY - d.y) * scale;
            setView((v) => ({ ...v, x, y }));
          }}
          onPointerUp={(e) => {
            if (drag.current && !drag.current.moved && e.target === svg.current) setSel(null);
            drag.current = null;
          }}
          onPointerLeave={() => (drag.current = null)}
        >
          {[R.workflow, R.team, R.role, R.skill, R.tool].map((r) => (
            <circle key={r} r={r} fill="none" className="stroke-foreground/10" strokeWidth={1} strokeDasharray="2 7" />
          ))}
          {graph.edges.map((e, i) => {
            const p = graph.byId[e.from];
            const q = graph.byId[e.to];
            if (!p || !q) return null;
            const vis = on(e.from) && on(e.to);
            if (e.kind === "step") {
              return (
                <path
                  key={i}
                  d={`M${p.x} ${p.y} Q${(p.x + q.x) * 0.3} ${(p.y + q.y) * 0.3} ${q.x} ${q.y}`}
                  fill="none"
                  stroke={WORKFLOW}
                  strokeWidth={2.5}
                  strokeDasharray="6 5"
                  opacity={vis ? 0.85 : 0.08}
                />
              );
            }
            return (
              <line
                key={i}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke={e.kind === "uses" ? TOOL : q.color}
                strokeWidth={e.kind === "uses" ? 1.4 : 1.8}
                strokeDasharray={e.kind === "uses" ? "3 4" : undefined}
                opacity={vis ? 0.55 : 0.06}
              />
            );
          })}
          {graph.nodes.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              opacity={on(n.id) ? 1 : 0.15}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setSel(n.id === sel ? null : n.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover(null)}
            >
              <Shape n={n} selected={n.id === sel} />
              <Label n={n} />
            </g>
          ))}
        </svg>
        <div className="absolute right-3 top-3 flex flex-col gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => zoom(1 / 1.3)} aria-label="Zoom in">
            <IconZoomIn className="size-4" />
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => zoom(1.3)} aria-label="Zoom out">
            <IconZoomOut className="size-4" />
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => setView(fit)} aria-label="Fit to screen">
            <IconFocus2 className="size-4" />
          </Button>
        </div>
        <Legend />
      </div>
      <aside className="w-full shrink-0 overflow-y-auto border-t bg-background p-4 md:w-[320px] md:border-l md:border-t-0">
        {!s ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-base font-semibold">Who knows what</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Every team, the roles in it, the skills its AI teammate has learned, the tools those skills may use,
                and the workflows that pass between teams.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(counts).map(([k, v]) => (
                <div key={k} className="rounded-lg border px-3 py-2">
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                  <div className="text-xs capitalize text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Click a node to trace it. Scroll to zoom, drag to move.</p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => askAgent("Look at our knowledge graph: which teams have few skills compared to their hours AI could save, and which skills should we teach next?")}
            >
              ✦ Where are our gaps?
            </Button>
          </div>
        ) : (
          <Detail n={s} org={org} onPick={setSel} onOpenTeam={(id) => navigate(`/home?dept=${encodeURIComponent(id)}`)} />
        )}
      </aside>
    </div>
  );
}

function Shape({ n, selected }: { n: GNode; selected: boolean }) {
  const ring = selected ? 4 : 0;
  const stroke = "var(--background)";
  switch (n.kind) {
    case "org":
      return <rect x={-34} y={-34} width={68} height={68} rx={14} fill="#f6c443" stroke={stroke} strokeWidth={3 + ring} />;
    case "team":
      return <rect x={-22} y={-22} width={44} height={44} rx={10} fill={n.color} stroke={stroke} strokeWidth={2.5 + ring} />;
    case "role":
      return <circle r={10} fill="var(--background)" stroke={n.color} strokeWidth={3 + ring} />;
    case "skill":
      return <path d="M0 -15 15 0 0 15 -15 0Z" fill={SKILL} stroke={stroke} strokeWidth={2 + ring} />;
    case "tool":
      return <rect x={-13} y={-13} width={26} height={26} rx={6} fill={TOOL} stroke={stroke} strokeWidth={2 + ring} />;
    default:
      return <circle r={13} fill={WORKFLOW} stroke={stroke} strokeWidth={2 + ring} />;
  }
}

function Label({ n }: { n: GNode }) {
  const cls = "fill-foreground";
  if (n.kind === "org")
    return (
      <text y={58} textAnchor="middle" fontSize={22} fontWeight={700} className={cls}>
        {n.label}
      </text>
    );
  if (n.kind === "team")
    return (
      <text y={44} textAnchor="middle" fontSize={19} fontWeight={700} className={cls}>
        {n.label}
      </text>
    );
  if (n.kind === "workflow")
    return (
      <text y={-20} textAnchor="middle" fontSize={15} fontWeight={600} fill={WORKFLOW}>
        ⚡ {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
      </text>
    );
  // Outer rings: text points outward along the radius.
  const deg = (n.a * 180) / Math.PI;
  const flip = Math.cos(n.a) < 0;
  const off = n.kind === "role" ? 16 : 22;
  const text = n.kind === "skill" ? `📘 ${n.label}` : n.label;
  return (
    <text
      transform={`rotate(${flip ? deg + 180 : deg})`}
      x={flip ? -off : off}
      y={4}
      textAnchor={flip ? "end" : "start"}
      fontSize={n.kind === "role" ? 14 : 15}
      fontWeight={n.kind === "skill" ? 600 : 400}
      className={n.kind === "role" ? "fill-muted-foreground" : cls}
    >
      {text.length > 30 ? `${text.slice(0, 29)}…` : text}
    </text>
  );
}

function Detail({ n, org, onPick, onOpenTeam }: { n: GNode; org: OrgSnapshot; onPick: (id: string) => void; onOpenTeam: (id: string) => void }) {
  const team = (id: string) => org.departments.find((d) => d.id === id);
  const head = (eyebrow: string, title: string, sub?: string) => (
    <div className="mb-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  const chip = (id: string, label: string) => (
    <button key={id} onClick={() => onPick(id)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">
      {label}
    </button>
  );

  if (n.kind === "team") {
    const d = team(n.ref!)!;
    const skills = org.skills.filter((s) => s.departmentId === d.id);
    const flows = org.workflows.filter((w) => w.steps.some((s) => s.departmentId === d.id));
    return (
      <div className="space-y-3 text-sm">
        {head("Team", n.label, n.sub)}
        <p className="text-muted-foreground">{d.mission}</p>
        <div className="flex flex-wrap gap-1">{d.roles.map((r, i) => chip(`role:${d.id}:${i}`, `${r.count}× ${r.title}`))}</div>
        <div>
          <div className="mb-1 text-xs font-semibold">Skills ({skills.length})</div>
          <div className="flex flex-wrap gap-1">{skills.map((s) => chip(`skill:${s.id}`, `📘 ${s.name}`))}</div>
          {!skills.length && <p className="text-xs text-muted-foreground">No skills yet.</p>}
        </div>
        {flows.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold">In workflows</div>
            <div className="flex flex-wrap gap-1">{flows.map((w) => chip(`wf:${w.id}`, `⚡ ${w.name}`))}</div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => onOpenTeam(d.id)}>
            Open on map
          </Button>
          <Button size="sm" variant="outline" onClick={() => askAgent(`What else could AI do for the ${d.name} team? Suggest 3 skills.`, `departmentId=${d.id}`)}>
            ✦ Suggest skills
          </Button>
        </div>
      </div>
    );
  }
  if (n.kind === "skill") {
    const s = org.skills.find((x) => x.id === n.ref)!;
    const d = team(s.departmentId);
    return (
      <div className="space-y-3 text-sm">
        {head(`Skill · ${d?.name ?? ""}`, s.name, n.sub)}
        <p className="text-muted-foreground">{s.description}</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs">
          {s.steps.map((st, i) => (
            <li key={i}>
              <span className="font-medium">{st.title}</span>
              {st.detail && <span className="text-muted-foreground"> — {st.detail}</span>}
            </li>
          ))}
        </ol>
        <div>
          <div className="mb-1 text-xs font-semibold">Tools it may use</div>
          <div className="flex flex-wrap gap-1">{s.tools.map((t) => chip(`tool:${t}`, TOOL_LABEL[t] ?? t))}</div>
          {!s.tools.length && <p className="text-xs text-muted-foreground">None. It only writes text.</p>}
        </div>
        {d && (
          <Button size="sm" variant="outline" onClick={() => onOpenTeam(d.id)}>
            Open {d.name} on map
          </Button>
        )}
      </div>
    );
  }
  if (n.kind === "tool") {
    const users = org.skills.filter((s) => s.tools.includes(n.ref!));
    return (
      <div className="space-y-3 text-sm">
        {head("Tool", n.label, n.sub)}
        <div className="flex flex-wrap gap-1">{users.map((s) => chip(`skill:${s.id}`, `📘 ${s.name}`))}</div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/connectors">Manage connectors</Link>
        </Button>
      </div>
    );
  }
  if (n.kind === "workflow") {
    const w = org.workflows.find((x) => x.id === n.ref)!;
    return (
      <div className="space-y-3 text-sm">
        {head("Workflow", w.name, n.sub)}
        <p className="text-muted-foreground">{w.goal}</p>
        <ol className="space-y-1.5 text-xs">
          {w.steps.map((st, i) => {
            const d = team(st.departmentId);
            return (
              <li key={st.id} className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px]">{i + 1}</span>
                <span>
                  <span className="font-medium">{st.title}</span>{" "}
                  <span className="text-muted-foreground">
                    · {d?.emoji} {d?.name} {st.kind === "approval" && "· needs approval"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <Button size="sm" variant="outline" asChild>
          <Link to="/home?panel=workflows">Open workflows</Link>
        </Button>
      </div>
    );
  }
  if (n.kind === "role") {
    const d = team(n.ref!)!;
    return (
      <div className="space-y-3 text-sm">
        {head(`Role · ${d.name}`, n.label, n.sub)}
        {chip(`team:${d.id}`, `${d.emoji} ${d.name}`)}
      </div>
    );
  }
  return head("Company", n.label, org.company?.description);
}

function Legend() {
  const item = (shape: React.ReactNode, label: string) => (
    <span className="flex items-center gap-1.5">
      <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden>
        {shape}
      </svg>
      {label}
    </span>
  );
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
      {item(<rect x={-6} y={-6} width={12} height={12} rx={3} fill="#6366f1" />, "team")}
      {item(<circle r={5} fill="none" stroke="#6366f1" strokeWidth={2} />, "role")}
      {item(<path d="M0 -7 7 0 0 7 -7 0Z" fill={SKILL} />, "skill")}
      {item(<rect x={-6} y={-6} width={12} height={12} rx={3} fill={TOOL} />, "tool")}
      {item(<circle r={6} fill={WORKFLOW} />, "workflow")}
    </div>
  );
}
