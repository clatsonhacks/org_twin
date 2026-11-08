import { runMigrations } from "@agent-native/core/db";

const owned = `owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`;

export const runOrgTwinMigrations = runMigrations(
  [
    {
      version: 1,
      name: "orgtwin-initial",
      sql: `CREATE TABLE IF NOT EXISTS ot_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ${owned}
);
CREATE TABLE IF NOT EXISTS ot_departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏢',
  color TEXT NOT NULL DEFAULT '#6366f1',
  mission TEXT NOT NULL DEFAULT '',
  headcount INTEGER NOT NULL DEFAULT 1,
  hours_automatable INTEGER NOT NULL DEFAULT 0,
  roles_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${owned}
);
CREATE INDEX IF NOT EXISTS idx_ot_departments_owner ON ot_departments (owner_email, sort_order);
CREATE TABLE IF NOT EXISTS ot_skills (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps_json TEXT NOT NULL DEFAULT '[]',
  minutes_saved INTEGER NOT NULL DEFAULT 0,
  times_used INTEGER NOT NULL DEFAULT 0,
  ${owned}
);
CREATE INDEX IF NOT EXISTS idx_ot_skills_owner ON ot_skills (owner_email, department_id);
CREATE TABLE IF NOT EXISTS ot_workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  steps_json TEXT NOT NULL DEFAULT '[]',
  ${owned}
);
CREATE TABLE IF NOT EXISTS ot_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_step INTEGER NOT NULL DEFAULT 0,
  steps_json TEXT NOT NULL DEFAULT '[]',
  input TEXT NOT NULL DEFAULT '',
  ${owned}
);
CREATE INDEX IF NOT EXISTS idx_ot_runs_owner ON ot_runs (owner_email, created_at);
CREATE TABLE IF NOT EXISTS ot_requests (
  id TEXT PRIMARY KEY,
  from_name TEXT NOT NULL,
  from_department_id TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  department_id TEXT NOT NULL DEFAULT '',
  skill_id TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  ${owned}
);
CREATE INDEX IF NOT EXISTS idx_ot_requests_owner ON ot_requests (owner_email, created_at)`,
    },
    {
      version: 2,
      name: "orgtwin-skill-tools-and-a2a",
      sql: `ALTER TABLE ot_skills ADD COLUMN tools_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS ot_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT '',
  from_department_id TEXT NOT NULL DEFAULT '',
  to_department_id TEXT NOT NULL DEFAULT '',
  to_agent_url TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'task',
  text TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  reply TEXT NOT NULL DEFAULT '',
  ${owned}
);
CREATE INDEX IF NOT EXISTS idx_ot_messages_owner ON ot_messages (owner_email, created_at)`,
    },
  ],
  { table: "orgtwin_migrations" },
);
