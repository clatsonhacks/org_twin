import { createHash } from "node:crypto";

import {
  getSnapshot,
  resetOrg,
  setCompany,
  upsertDepartment,
  upsertSkill,
  upsertWorkflow,
} from "./store.js";

/** A ready-made company so the app is useful (and demoable) before anyone describes their own. */
export async function loadSampleCompany(owner: string) {
  // Row ids are global primary keys: give this workspace's sample its own ids.
  const tag = createHash("sha256").update(owner).digest("hex").slice(0, 6);
  const k = (base: string) => `${base}_${tag}`;
  await resetOrg(owner);
  await setCompany(owner, {
    name: "Northwind Robotics",
    description: "A 42-person B2B startup that sells warehouse-picking robots on a monthly subscription.",
  });
  const d = async (
    id: string,
    name: string,
    emoji: string,
    color: string,
    mission: string,
    headcount: number,
    hoursAutomatable: number,
    roles: Array<[string, number]>,
  ) =>
    upsertDepartment(owner, {
      id,
      name,
      emoji,
      color,
      mission,
      headcount,
      hoursAutomatable,
      roles: roles.map(([title, count]) => ({ title, count })),
    });
  await d(k("sales"), "Sales", "💼", "#6366f1", "Find, qualify and close warehouse operators.", 8, 46, [
    ["Account Executive", 4],
    ["SDR", 3],
    ["Sales Lead", 1],
  ]);
  await d(k("finance"), "Finance", "💰", "#10b981", "Invoicing, cash collection and monthly close.", 4, 28, [
    ["Accountant", 2],
    ["Billing Specialist", 1],
    ["CFO", 1],
  ]);
  await d(k("success"), "Customer Success", "🤝", "#f59e0b", "Onboard customers and keep robots picking.", 7, 39, [
    ["CSM", 4],
    ["Onboarding Lead", 2],
    ["Head of CS", 1],
  ]);
  await d(k("engineering"), "Engineering", "🛠️", "#0ea5e9", "Robot fleet software, data and integrations.", 14, 35, [
    ["Software Engineer", 9],
    ["Data Analyst", 2],
    ["SRE", 2],
    ["CTO", 1],
  ]);
  await d(k("marketing"), "Marketing", "📣", "#ec4899", "Pipeline from content, events and case studies.", 5, 31, [
    ["Content Marketer", 2],
    ["Demand Gen", 2],
    ["CMO", 1],
  ]);
  await d(k("people"), "People Ops", "🧑‍🤝‍🧑", "#a855f7", "Hiring, onboarding and everything for the team.", 4, 22, [
    ["Recruiter", 2],
    ["People Partner", 1],
    ["Office Manager", 1],
  ]);

  const s = (departmentId: string, name: string, description: string, minutesSaved: number, steps: string[]) =>
    upsertSkill(owner, {
      departmentId,
      name,
      description,
      minutesSaved,
      steps: steps.map((t) => {
        const [title, detail = ""] = t.split(" :: ");
        return { title: title!, detail };
      }),
    });
  await s(k("sales"), "Qualify inbound lead", "Score a new lead against our ICP and draft the first reply.", 25, [
    "Read the lead :: company, warehouse size, picks per day, current system",
    "Score 0-100 against ICP :: >20k picks/day and a WMS we integrate with score high",
    "Draft a personal first email :: mention their volume and one relevant case study",
  ]);
  await s(k("sales"), "Prepare a quote", "Build a robot subscription quote from deal notes.", 40, [
    "Size the fleet :: 1 robot per ~2.5k picks/day, round up",
    "Price it :: $2,400 per robot per month, 10% off for 12+ months",
    "Write the quote summary :: fleet, term, monthly total, start date",
  ]);
  await s(k("finance"), "Draft invoice from won deal", "Turn a won deal into invoice lines ready for approval.", 30, [
    "Read the won deal :: customer, fleet size, monthly price, start date",
    "Create invoice lines :: subscription, one-time install fee $1,500 per site",
    "Check payment terms :: net 30 unless the deal says otherwise",
  ]);
  await s(k("finance"), "Chase overdue invoice", "Write a friendly reminder for an overdue invoice.", 15, [
    "Look up the invoice and days overdue",
    "Draft reminder :: friendly at 7 days, firm at 30 days, offer a call",
  ]);
  await s(k("success"), "Write onboarding plan", "A 30-day go-live plan for a new customer.", 60, [
    "Read the deal and invoice :: sites, fleet size, start date",
    "Plan weeks 1-4 :: site survey, install, WMS integration, go-live",
    "Draft the welcome email :: plan, named CSM, first meeting slots",
  ]);
  await s(k("engineering"), "Churn and usage analysis", "Answer questions about customer usage, churn and robot uptime.", 90, [
    "Restate the question and the metric",
    "Pull the numbers :: picks/day, uptime, tickets, renewals",
    "Write the analysis :: 3 findings, a chart description, 2 recommendations",
  ]);
  await s(k("marketing"), "Turn a win into a case study", "Draft a short case study from a won deal.", 120, [
    "Collect facts :: customer, problem, fleet size, results",
    "Write 300 words :: challenge, solution, numbers, quote placeholder",
  ]);
  await s(k("people"), "Draft a job description", "Write a job post from a hiring request.", 45, [
    "Clarify role, level and team",
    "Write the post :: mission, responsibilities, must-haves, salary band placeholder",
  ]);

  await upsertWorkflow(owner, {
    id: k("wf_lead_to_cash"),
    name: "Lead to cash",
    goal: "Take a new inbound lead all the way to a paid invoice and an onboarding plan.",
    steps: [
      { departmentId: k("sales"), kind: "work", title: "Qualify the lead", minutes: 20, instructions: "Use the 'Qualify inbound lead' skill on the run input. Output the score and the drafted first email." },
      { departmentId: k("sales"), kind: "work", title: "Prepare the quote", minutes: 40, instructions: "Assume the lead said yes. Size the fleet and price it with the 'Prepare a quote' skill." },
      { departmentId: k("finance"), kind: "work", title: "Draft the invoice", minutes: 30, instructions: "Turn the quote into invoice lines with totals and terms." },
      { departmentId: k("finance"), kind: "approval", title: "Finance approves the invoice", minutes: 5, instructions: "A person in Finance checks the invoice before it is sent." },
      { departmentId: k("success"), kind: "work", title: "Onboarding plan + welcome email", minutes: 60, instructions: "Write the 30-day onboarding plan and the welcome email for the customer." },
    ],
  });
  await upsertWorkflow(owner, {
    id: k("wf_new_hire"),
    name: "New hire onboarding",
    goal: "Get a new engineer from signed offer to productive in week one.",
    steps: [
      { departmentId: k("people"), kind: "work", title: "Welcome pack", minutes: 45, instructions: "Write the first-week schedule and welcome email." },
      { departmentId: k("engineering"), kind: "work", title: "Access + starter task", minutes: 30, instructions: "List the accounts to create and pick a good first task." },
      { departmentId: k("people"), kind: "approval", title: "Manager signs off", minutes: 5, instructions: "The hiring manager confirms the plan." },
    ],
  });
  const snap = await getSnapshot(owner);
  return {
    company: snap.company,
    departments: snap.departments.length,
    skills: snap.skills.length,
    workflows: snap.workflows.map((w) => ({ id: w.id, name: w.name })),
  };
}
