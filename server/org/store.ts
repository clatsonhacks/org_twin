import { and, asc, desc, eq } from "drizzle-orm";

import {
  DEPARTMENT_COLORS,
  type AgentMessage,
  type Company,
  type Department,
  type OrgSnapshot,
  type Role,
  type Run,
  type RunStep,
  type Skill,
  type SkillStep,
  type TeamRequest,
  type Workflow,
  type WorkflowStep,
} from "../../shared/types.js";
import { getDb } from "../db/index.js";
import { emitOrgTwin } from "./events.js";
import {
  companies,
  departments,
  messages,
  requests,
  runs,
  skills,
  workflows,
} from "../db/schema.js";

export function requireUserEmail(email: string | undefined): string {
  if (!email) throw new Error("Authentication required.");
  return email;
}

/** Owner key for data shared by a workspace (organization). Personal data is keyed by email. */
export function workspaceKey(orgId: string): string {
  return `org:${orgId}`;
}

const adopted = new Set<string>();
/**
 * Moving to shared workspaces: the first time a workspace is opened and it is still empty, bring along the
 * company its member built on their own before (data was per person until now). Never merges into a
 * workspace that already has a company.
 */
export async function adoptPersonalData(email: string, key: string): Promise<void> {
  if (key === email || adopted.has(`${email}>${key}`)) return;
  const db = getDb();
  const [hasWorkspace] = await db.select({ id: companies.id }).from(companies).where(eq(companies.ownerEmail, key));
  const [hasPersonal] = await db.select({ id: departments.id }).from(departments).where(eq(departments.ownerEmail, email));
  if (!hasWorkspace && hasPersonal) {
    for (const t of [companies, departments, skills, workflows, runs, requests, messages]) {
      await db.update(t).set({ ownerEmail: key }).where(eq(t.ownerEmail, email));
    }
  }
  adopted.add(`${email}>${key}`);
}

const nowIso = () => new Date().toISOString();

export function slugId(name: string, prefix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${prefix}_${slug || "x"}_${Math.random().toString(36).slice(2, 7)}`;
}

function parse<T>(json: string, fallback: T): T {
  try {
    const v = JSON.parse(json);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/* ---------------- mapping ---------------- */

function toDepartment(r: typeof departments.$inferSelect): Department {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    mission: r.mission,
    headcount: r.headcount,
    hoursAutomatable: r.hoursAutomatable,
    roles: parse<Role[]>(r.rolesJson, []),
    sortOrder: r.sortOrder,
  };
}

function toSkill(r: typeof skills.$inferSelect): Skill {
  return {
    id: r.id,
    departmentId: r.departmentId,
    name: r.name,
    description: r.description,
    steps: parse<SkillStep[]>(r.stepsJson, []),
    minutesSaved: r.minutesSaved,
    timesUsed: r.timesUsed,
    tools: parse<string[]>(r.toolsJson, []),
  };
}

function toMessage(r: typeof messages.$inferSelect): AgentMessage {
  return {
    id: r.id,
    runId: r.runId,
    fromDepartmentId: r.fromDepartmentId,
    toDepartmentId: r.toDepartmentId,
    toAgentUrl: r.toAgentUrl,
    kind: r.kind as AgentMessage["kind"],
    text: r.text,
    data: parse<Record<string, unknown>>(r.dataJson, {}),
    reply: r.reply,
    createdAt: r.createdAt,
  };
}

function toWorkflow(r: typeof workflows.$inferSelect): Workflow {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal,
    steps: parse<WorkflowStep[]>(r.stepsJson, []),
  };
}

function toRun(r: typeof runs.$inferSelect): Run {
  return {
    id: r.id,
    workflowId: r.workflowId,
    name: r.name,
    status: r.status as Run["status"],
    currentStep: r.currentStep,
    steps: parse<RunStep[]>(r.stepsJson, []),
    input: r.input,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toRequest(r: typeof requests.$inferSelect): TeamRequest {
  return {
    id: r.id,
    fromName: r.fromName,
    fromDepartmentId: r.fromDepartmentId,
    text: r.text,
    status: r.status as TeamRequest["status"],
    departmentId: r.departmentId,
    skillId: r.skillId,
    result: r.result,
    createdAt: r.createdAt,
  };
}

/* ---------------- snapshot ---------------- */

export async function getSnapshot(owner: string): Promise<OrgSnapshot> {
  const db = getDb();
  const [co, deps, sks, wfs, rns, reqs, msgs] = await Promise.all([
    db.select().from(companies).where(eq(companies.ownerEmail, owner)),
    db
      .select()
      .from(departments)
      .where(eq(departments.ownerEmail, owner))
      .orderBy(asc(departments.sortOrder), asc(departments.createdAt)),
    db.select().from(skills).where(eq(skills.ownerEmail, owner)).orderBy(asc(skills.createdAt)),
    db.select().from(workflows).where(eq(workflows.ownerEmail, owner)).orderBy(asc(workflows.createdAt)),
    db.select().from(runs).where(eq(runs.ownerEmail, owner)).orderBy(desc(runs.createdAt)).limit(20),
    db.select().from(requests).where(eq(requests.ownerEmail, owner)).orderBy(desc(requests.createdAt)).limit(30),
    db.select().from(messages).where(eq(messages.ownerEmail, owner)).orderBy(desc(messages.createdAt)).limit(40),
  ]);
  const departmentList = deps.map(toDepartment);
  const runList = rns.map(toRun);
  const skillList = sks.map(toSkill);
  const requestList = reqs.map(toRequest);
  // Real time saved: every finished run step (all runs, not just the latest 20), plus finished requests at
  // the time their skill usually takes by hand.
  const [allRuns, allRequests] = await Promise.all([
    db.select({ stepsJson: runs.stepsJson }).from(runs).where(eq(runs.ownerEmail, owner)),
    db
      .select({ status: requests.status, skillId: requests.skillId, departmentId: requests.departmentId })
      .from(requests)
      .where(eq(requests.ownerEmail, owner)),
  ]);
  const savedMinutesByDept: Record<string, number> = {};
  const addSaved = (dept: string, m: number) => {
    if (dept && m > 0) savedMinutesByDept[dept] = (savedMinutesByDept[dept] ?? 0) + m;
  };
  for (const r of allRuns) {
    for (const s of parse<RunStep[]>(r.stepsJson, [])) if (s.status === "done") addSaved(s.departmentId, s.minutesSaved || 0);
  }
  for (const r of allRequests) {
    if (r.status !== "done" || !r.skillId) continue;
    const skill = skillList.find((s) => s.id === r.skillId);
    if (skill) addSaved(r.departmentId || skill.departmentId, skill.minutesSaved);
  }
  const savedMinutes = Object.values(savedMinutesByDept).reduce((a, m) => a + m, 0);
  return {
    company: co[0] ? { name: co[0].name, description: co[0].description } : null,
    departments: departmentList,
    skills: skillList,
    workflows: wfs.map(toWorkflow),
    runs: runList,
    requests: requestList,
    messages: msgs.map(toMessage),
    stats: {
      hoursSaved: Math.round((savedMinutes / 60) * 10) / 10,
      savedMinutesByDept,
      runsDone: runList.filter((r) => r.status === "done").length,
      waitingApprovals: runList.filter((r) => r.status === "waiting_approval").length,
    },
  };
}

/* ---------------- company & departments ---------------- */

export async function setCompany(owner: string, company: Company) {
  const db = getDb();
  const existing = await db.select().from(companies).where(eq(companies.ownerEmail, owner));
  if (existing[0]) {
    await db
      .update(companies)
      .set({ name: company.name, description: company.description, updatedAt: nowIso() })
      .where(eq(companies.id, existing[0].id));
  } else {
    await db.insert(companies).values({
      id: slugId(company.name, "co"),
      name: company.name,
      description: company.description,
      ownerEmail: owner,
    });
  }
}

export interface DepartmentInput {
  id?: string | undefined;
  name: string;
  emoji?: string | undefined;
  color?: string | undefined;
  mission?: string | undefined;
  headcount?: number | undefined;
  hoursAutomatable?: number | undefined;
  roles?: Role[] | undefined;
}

export async function upsertDepartment(owner: string, input: DepartmentInput): Promise<Department> {
  const db = getDb();
  if (input.id) {
    const [row] = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, input.id), eq(departments.ownerEmail, owner)));
    if (row) {
      const patch: Partial<typeof departments.$inferInsert> = { updatedAt: nowIso(), name: input.name };
      if (input.emoji !== undefined) patch.emoji = input.emoji;
      if (input.color !== undefined) patch.color = input.color;
      if (input.mission !== undefined) patch.mission = input.mission;
      if (input.headcount !== undefined) patch.headcount = input.headcount;
      if (input.hoursAutomatable !== undefined) patch.hoursAutomatable = input.hoursAutomatable;
      if (input.roles !== undefined) patch.rolesJson = JSON.stringify(input.roles);
      await db.update(departments).set(patch).where(eq(departments.id, row.id));
      const [updated] = await db.select().from(departments).where(eq(departments.id, row.id));
      return toDepartment(updated!);
    }
  }
  const count = (await db.select().from(departments).where(eq(departments.ownerEmail, owner))).length;
  const id = input.id || slugId(input.name, "dept");
  await db.insert(departments).values({
    id,
    name: input.name,
    emoji: input.emoji || "🏢",
    color: input.color || DEPARTMENT_COLORS[count % DEPARTMENT_COLORS.length]!,
    mission: input.mission || "",
    headcount: input.headcount ?? 1,
    hoursAutomatable: input.hoursAutomatable ?? 0,
    rolesJson: JSON.stringify(input.roles ?? []),
    sortOrder: count,
    ownerEmail: owner,
  });
  const [row] = await db.select().from(departments).where(eq(departments.id, id));
  return toDepartment(row!);
}

export async function deleteDepartment(owner: string, id: string) {
  const db = getDb();
  await db.delete(skills).where(and(eq(skills.departmentId, id), eq(skills.ownerEmail, owner)));
  await db.delete(departments).where(and(eq(departments.id, id), eq(departments.ownerEmail, owner)));
}

/** Replace the whole org (company + departments). Skills, workflows, runs and requests are cleared. */
export async function resetOrg(owner: string) {
  const db = getDb();
  for (const t of [messages, requests, runs, workflows, skills, departments, companies]) {
    await db.delete(t).where(eq(t.ownerEmail, owner));
  }
}

export async function departmentExists(owner: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.ownerEmail, owner)));
  return Boolean(row);
}

export async function resolveDepartmentId(owner: string, idOrName: string): Promise<string> {
  const db = getDb();
  const all = await db.select().from(departments).where(eq(departments.ownerEmail, owner));
  const key = idOrName.trim().toLowerCase();
  const hit =
    all.find((d) => d.id === idOrName) ||
    all.find((d) => d.name.toLowerCase() === key) ||
    all.find((d) => d.name.toLowerCase().includes(key) || key.includes(d.name.toLowerCase()));
  if (!hit) {
    throw new Error(
      `Unknown department "${idOrName}". Known: ${all.map((d) => `${d.name} (${d.id})`).join(", ") || "none — build the org first"}.`,
    );
  }
  return hit.id;
}

/* ---------------- skills ---------------- */

export interface SkillInput {
  id?: string | undefined;
  departmentId: string;
  name: string;
  description?: string | undefined;
  steps?: SkillStep[] | undefined;
  minutesSaved?: number | undefined;
  tools?: string[] | undefined;
}

export async function upsertSkill(owner: string, input: SkillInput): Promise<Skill> {
  const db = getDb();
  const departmentId = await resolveDepartmentId(owner, input.departmentId);
  if (input.id) {
    const [row] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.id, input.id), eq(skills.ownerEmail, owner)));
    if (row) {
      const patch: Partial<typeof skills.$inferInsert> = { updatedAt: nowIso(), name: input.name, departmentId };
      if (input.description !== undefined) patch.description = input.description;
      if (input.steps !== undefined) patch.stepsJson = JSON.stringify(input.steps);
      if (input.minutesSaved !== undefined) patch.minutesSaved = input.minutesSaved;
      if (input.tools !== undefined) patch.toolsJson = JSON.stringify(input.tools);
      await db.update(skills).set(patch).where(eq(skills.id, row.id));
      const [updated] = await db.select().from(skills).where(eq(skills.id, row.id));
      return toSkill(updated!);
    }
  }
  const id = input.id || slugId(input.name, "skill");
  await db.insert(skills).values({
    id,
    departmentId,
    name: input.name,
    description: input.description || "",
    stepsJson: JSON.stringify(input.steps ?? []),
    minutesSaved: input.minutesSaved ?? 0,
    toolsJson: JSON.stringify(input.tools ?? []),
    ownerEmail: owner,
  });
  const [row] = await db.select().from(skills).where(eq(skills.id, id));
  return toSkill(row!);
}

export async function deleteSkill(owner: string, id: string) {
  await getDb().delete(skills).where(and(eq(skills.id, id), eq(skills.ownerEmail, owner)));
}

export async function bumpSkillUse(owner: string, id: string) {
  const db = getDb();
  const [row] = await db.select().from(skills).where(and(eq(skills.id, id), eq(skills.ownerEmail, owner)));
  if (row) await db.update(skills).set({ timesUsed: row.timesUsed + 1 }).where(eq(skills.id, id));
}

/* ---------------- workflows ---------------- */

export interface WorkflowInput {
  id?: string | undefined;
  name: string;
  goal?: string | undefined;
  steps: Array<Omit<WorkflowStep, "id" | "minutes"> & { id?: string | undefined; minutes?: number | undefined }>;
}

export async function upsertWorkflow(owner: string, input: WorkflowInput): Promise<Workflow> {
  const db = getDb();
  const steps: WorkflowStep[] = [];
  for (const [i, s] of input.steps.entries()) {
    steps.push({
      id: s.id || `s${i + 1}_${Math.random().toString(36).slice(2, 6)}`,
      departmentId: await resolveDepartmentId(owner, s.departmentId),
      kind: s.kind === "approval" ? "approval" : "work",
      title: s.title,
      instructions: s.instructions || "",
      ...(typeof s.minutes === "number" ? { minutes: Math.max(0, Math.min(600, Math.round(s.minutes))) } : {}),
    });
  }
  if (input.id) {
    const [row] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, input.id), eq(workflows.ownerEmail, owner)));
    if (row) {
      await db
        .update(workflows)
        .set({
          name: input.name,
          goal: input.goal ?? row.goal,
          stepsJson: JSON.stringify(steps),
          updatedAt: nowIso(),
        })
        .where(eq(workflows.id, row.id));
      const [updated] = await db.select().from(workflows).where(eq(workflows.id, row.id));
      return toWorkflow(updated!);
    }
  }
  const id = input.id || slugId(input.name, "wf");
  await db.insert(workflows).values({
    id,
    name: input.name,
    goal: input.goal || "",
    stepsJson: JSON.stringify(steps),
    ownerEmail: owner,
  });
  const [row] = await db.select().from(workflows).where(eq(workflows.id, id));
  return toWorkflow(row!);
}

export async function deleteWorkflow(owner: string, id: string) {
  await getDb().delete(workflows).where(and(eq(workflows.id, id), eq(workflows.ownerEmail, owner)));
}

/* ---------------- runs ---------------- */

async function getRunRow(owner: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.ownerEmail, owner)));
  if (!row) throw new Error(`Run ${id} not found.`);
  return row;
}

function emitRunEvents(owner: string, run: Run) {
  if (run.status === "waiting_approval") {
    const step = run.steps[run.currentStep]!;
    emitOrgTwin("orgtwin.approval.requested", { runId: run.id, run: run.name, step: step.title, departmentId: step.departmentId }, owner);
  } else if (run.status === "done" || run.status === "rejected") {
    const minutesSaved = run.steps.reduce((a, s) => a + (s.status === "done" ? s.minutesSaved : 0), 0);
    emitOrgTwin("orgtwin.run.completed", { runId: run.id, run: run.name, status: run.status, minutesSaved }, owner);
  }
}

async function saveRun(run: Run) {
  await getDb()
    .update(runs)
    .set({
      status: run.status,
      currentStep: run.currentStep,
      stepsJson: JSON.stringify(run.steps),
      updatedAt: nowIso(),
    })
    .where(eq(runs.id, run.id));
}

/** Move to the next step after `index`; approval steps park the run until a person decides. */
function advance(run: Run, index: number) {
  const next = index + 1;
  if (next >= run.steps.length) {
    run.status = "done";
    run.currentStep = run.steps.length;
    return;
  }
  run.currentStep = next;
  const step = run.steps[next]!;
  if (step.kind === "approval") {
    step.status = "waiting";
    run.status = "waiting_approval";
  } else {
    step.status = "active";
    run.status = "running";
  }
}

export async function startRun(owner: string, workflowId: string, input: string): Promise<Run> {
  const db = getDb();
  const [wf] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.ownerEmail, owner)));
  if (!wf) throw new Error(`Workflow ${workflowId} not found.`);
  const active = await db
    .select()
    .from(runs)
    .where(and(eq(runs.ownerEmail, owner), eq(runs.workflowId, workflowId)));
  for (const r of active) {
    if (r.status === "running") {
      // An abandoned run of the same workflow would confuse the map; close it.
      await db.update(runs).set({ status: "rejected", updatedAt: nowIso() }).where(eq(runs.id, r.id));
    }
  }
  const steps: RunStep[] = toWorkflow(wf).steps.map((s) => ({
    ...s,
    status: "pending",
    output: "",
    minutesSaved: 0,
  }));
  const run: Run = {
    id: slugId(wf.name, "run"),
    workflowId,
    name: wf.name,
    status: "running",
    currentStep: -1,
    steps,
    input,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  advance(run, -1);
  await db.insert(runs).values({
    id: run.id,
    workflowId,
    name: run.name,
    status: run.status,
    currentStep: run.currentStep,
    stepsJson: JSON.stringify(run.steps),
    input,
    ownerEmail: owner,
  });
  emitRunEvents(owner, run);
  return run;
}

export async function completeStep(
  owner: string,
  runId: string,
  stepIndex: number,
  output: string,
  minutesSaved: number,
): Promise<Run> {
  const run = toRun(await getRunRow(owner, runId));
  if (run.status !== "running") {
    throw new Error(
      run.status === "waiting_approval"
        ? `Run is waiting for a person to approve step ${run.currentStep + 1}. Stop and tell the user to approve it on the map.`
        : `Run is already ${run.status}.`,
    );
  }
  if (stepIndex !== run.currentStep) {
    throw new Error(`Step ${stepIndex} is not the active step; the active step is ${run.currentStep}.`);
  }
  const step = run.steps[stepIndex]!;
  step.status = "done";
  step.output = output;
  step.minutesSaved = Math.max(0, Math.min(600, Math.round(minutesSaved)));
  step.finishedAt = nowIso();
  advance(run, stepIndex);
  await saveRun(run);
  await recordHandoffIfNeeded(owner, run, stepIndex);
  emitRunEvents(owner, run);
  return run;
}

/** When the next step belongs to another department, send it an A2A task with this step's output. */
async function recordHandoffIfNeeded(owner: string, run: Run, fromIndex: number) {
  const from = run.steps[fromIndex];
  // Skip approval steps: the hand-off goes from the last step that produced work.
  let toIndex = fromIndex + 1;
  while (run.steps[toIndex]?.kind === "approval") toIndex++;
  const to = run.steps[toIndex];
  if (!from || !to || from.kind === "approval" || from.departmentId === to.departmentId) return;
  await addMessage(owner, {
    runId: run.id,
    fromDepartmentId: from.departmentId,
    toDepartmentId: to.departmentId,
    kind: "task",
    text: `${to.title}: ${to.instructions}`.slice(0, 2000),
    data: { run: run.name, fromStep: from.title, output: from.output.slice(0, 4000) },
  });
}

/* ---------------- A2A messages ---------------- */

export async function addMessage(
  owner: string,
  input: {
    runId?: string | undefined;
    fromDepartmentId?: string | undefined;
    toDepartmentId?: string | undefined;
    toAgentUrl?: string | undefined;
    kind: AgentMessage["kind"];
    text: string;
    data?: Record<string, unknown> | undefined;
    reply?: string | undefined;
  },
): Promise<AgentMessage> {
  const id = slugId(input.kind, "msg");
  await getDb().insert(messages).values({
    id,
    runId: input.runId ?? "",
    fromDepartmentId: input.fromDepartmentId ?? "",
    toDepartmentId: input.toDepartmentId ?? "",
    toAgentUrl: input.toAgentUrl ?? "",
    kind: input.kind,
    text: input.text,
    dataJson: JSON.stringify(input.data ?? {}),
    reply: input.reply ?? "",
    ownerEmail: owner,
  });
  const [row] = await getDb().select().from(messages).where(eq(messages.id, id));
  return toMessage(row!);
}

export async function getSkill(owner: string, id: string): Promise<Skill | null> {
  const [row] = await getDb()
    .select()
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.ownerEmail, owner)));
  return row ? toSkill(row) : null;
}

export async function decideApproval(
  owner: string,
  runId: string,
  approve: boolean,
  note: string,
  decidedBy: string,
): Promise<Run> {
  const run = toRun(await getRunRow(owner, runId));
  if (run.status !== "waiting_approval") throw new Error("This run is not waiting for an approval.");
  const step = run.steps[run.currentStep]!;
  step.decidedBy = decidedBy;
  step.note = note;
  step.finishedAt = nowIso();
  if (approve) {
    step.status = "done";
    step.output = note ? `Approved: ${note}` : "Approved";
    step.minutesSaved = 0;
    advance(run, run.currentStep);
  } else {
    step.status = "rejected";
    step.output = note ? `Rejected: ${note}` : "Rejected";
    run.status = "rejected";
  }
  await saveRun(run);
  emitRunEvents(owner, run);
  return run;
}

export async function cancelRun(owner: string, runId: string): Promise<Run> {
  const run = toRun(await getRunRow(owner, runId));
  if (run.status === "done" || run.status === "rejected") return run;
  run.status = "rejected";
  const step = run.steps[run.currentStep];
  if (step) {
    step.status = "rejected";
    step.output = "Cancelled";
  }
  await saveRun(run);
  return run;
}

export async function getRun(owner: string, runId: string): Promise<Run> {
  return toRun(await getRunRow(owner, runId));
}

/* ---------------- requests ---------------- */

export async function createRequest(
  owner: string,
  input: { fromName: string; fromDepartmentId?: string | undefined; text: string },
): Promise<TeamRequest> {
  const id = slugId(input.text.slice(0, 24), "req");
  const fromDepartmentId = input.fromDepartmentId
    ? await resolveDepartmentId(owner, input.fromDepartmentId).catch(() => "")
    : "";
  await getDb().insert(requests).values({
    id,
    fromName: input.fromName,
    fromDepartmentId,
    text: input.text,
    ownerEmail: owner,
  });
  const [row] = await getDb().select().from(requests).where(eq(requests.id, id));
  emitOrgTwin("orgtwin.request.created", { requestId: id, fromName: input.fromName, text: input.text }, owner);
  return toRequest(row!);
}

export async function updateRequest(
  owner: string,
  id: string,
  patch: { status?: TeamRequest["status"] | undefined; departmentId?: string | undefined; skillId?: string | undefined; result?: string | undefined },
): Promise<TeamRequest> {
  const db = getDb();
  const [row] = await db.select().from(requests).where(and(eq(requests.id, id), eq(requests.ownerEmail, owner)));
  if (!row) throw new Error(`Request ${id} not found.`);
  const set: Partial<typeof requests.$inferInsert> = { updatedAt: nowIso() };
  if (patch.status) set.status = patch.status;
  if (patch.departmentId) set.departmentId = await resolveDepartmentId(owner, patch.departmentId);
  if (patch.skillId !== undefined) set.skillId = patch.skillId;
  if (patch.result !== undefined) set.result = patch.result;
  await db.update(requests).set(set).where(eq(requests.id, id));
  if (patch.skillId && patch.status === "done") await bumpSkillUse(owner, patch.skillId);
  const [updated] = await db.select().from(requests).where(eq(requests.id, id));
  return toRequest(updated!);
}

export async function deleteRequest(owner: string, id: string) {
  await getDb().delete(requests).where(and(eq(requests.id, id), eq(requests.ownerEmail, owner)));
}
