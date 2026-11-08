import { integer, now, table, text } from "@agent-native/core/db/schema";

const owned = {
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
};

/** Company profile: one row per owner. */
export const companies = table("ot_companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ...owned,
});

/** A department is one building on the map, with its own AI teammate. */
export const departments = table("ot_departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🏢"),
  color: text("color").notNull().default("#6366f1"),
  mission: text("mission").notNull().default(""),
  headcount: integer("headcount").notNull().default(1),
  hoursAutomatable: integer("hours_automatable").notNull().default(0),
  rolesJson: text("roles_json").notNull().default("[]"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...owned,
});

/** A skill is a repeatable job a department's agent knows how to do. */
export const skills = table("ot_skills", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  stepsJson: text("steps_json").notNull().default("[]"),
  minutesSaved: integer("minutes_saved").notNull().default(0),
  timesUsed: integer("times_used").notNull().default(0),
  ...owned,
});

/** A workflow is a cross-team sequence of steps; consecutive steps in different departments are handoffs. */
export const workflows = table("ot_workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  goal: text("goal").notNull().default(""),
  stepsJson: text("steps_json").notNull().default("[]"),
  ...owned,
});

/** One execution of a workflow. Steps are copied in so editing the workflow never rewrites history. */
export const runs = table("ot_runs", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("running"),
  currentStep: integer("current_step").notNull().default(0),
  stepsJson: text("steps_json").notNull().default("[]"),
  input: text("input").notNull().default(""),
  ...owned,
});

/** "Ask a team": a person asks for work; the agent routes it to a department's skill and answers. */
export const requests = table("ot_requests", {
  id: text("id").primaryKey(),
  fromName: text("from_name").notNull(),
  fromDepartmentId: text("from_department_id").notNull().default(""),
  text: text("text").notNull(),
  status: text("status").notNull().default("open"),
  departmentId: text("department_id").notNull().default(""),
  skillId: text("skill_id").notNull().default(""),
  result: text("result").notNull().default(""),
  ...owned,
});
