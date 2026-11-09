export type StepKind = "work" | "approval";

export interface WorkflowStep {
  id: string;
  departmentId: string;
  kind: StepKind;
  title: string;
  instructions: string;
  /** How many minutes this step usually takes a person by hand (AI estimate unless someone changed it). */
  minutes?: number;
}

export type RunStepStatus = "pending" | "active" | "waiting" | "done" | "rejected";

export interface RunStep extends WorkflowStep {
  status: RunStepStatus;
  output: string;
  minutesSaved: number;
  decidedBy?: string;
  note?: string;
  finishedAt?: string;
}

export type RunStatus = "running" | "waiting_approval" | "done" | "rejected";

export interface SkillStep {
  title: string;
  detail: string;
}

export interface Role {
  title: string;
  count: number;
}

export interface Department {
  id: string;
  name: string;
  emoji: string;
  color: string;
  mission: string;
  headcount: number;
  hoursAutomatable: number;
  roles: Role[];
  sortOrder: number;
}

export interface Skill {
  id: string;
  departmentId: string;
  name: string;
  description: string;
  steps: SkillStep[];
  minutesSaved: number;
  timesUsed: number;
  /** Connector / MCP tools this skill may use, e.g. ["slack", "web", "mcp:helpdesk"]. Empty = no outside tools. */
  tools: string[];
}

/** An A2A-style task message between department agents, or to an outside A2A agent. */
export interface AgentMessage {
  id: string;
  runId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  toAgentUrl: string;
  kind: "task" | "external";
  text: string;
  data: Record<string, unknown>;
  reply: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  goal: string;
  steps: WorkflowStep[];
}

export interface Run {
  id: string;
  workflowId: string;
  name: string;
  status: RunStatus;
  currentStep: number;
  steps: RunStep[];
  input: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamRequest {
  id: string;
  fromName: string;
  fromDepartmentId: string;
  text: string;
  status: "open" | "in_progress" | "done";
  departmentId: string;
  skillId: string;
  result: string;
  createdAt: string;
}

export interface Company {
  name: string;
  description: string;
}

export interface OrgSnapshot {
  company: Company | null;
  departments: Department[];
  skills: Skill[];
  workflows: Workflow[];
  runs: Run[];
  requests: TeamRequest[];
  messages: AgentMessage[];
  stats: {
    /** Hours actually saved: finished run steps plus finished requests handled by a skill. */
    hoursSaved: number;
    /** The same, in minutes, per department id. */
    savedMinutesByDept: Record<string, number>;
    runsDone: number;
    waitingApprovals: number;
  };
}

export const DEPARTMENT_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#0ea5e9",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#84cc16",
];

/** Tools a skill can be granted (ids match server/connectors/registry.ts). */
export const TOOL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "slack", label: "💬 Slack" },
  { id: "discord", label: "🎮 Discord" },
  { id: "teams", label: "🟪 Teams" },
  { id: "telegram", label: "✈️ Telegram" },
  { id: "email", label: "✉️ Email" },
  { id: "notion", label: "📝 Notion" },
  { id: "hubspot", label: "🧡 HubSpot" },
  { id: "stripe", label: "💳 Stripe (test)" },
  { id: "sheets", label: "📊 Sheets" },
  { id: "github", label: "🐙 GitHub" },
  { id: "web", label: "🔎 Web search" },
  { id: "webhook", label: "🪝 Webhooks" },
];
