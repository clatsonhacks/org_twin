import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getSnapshot, resetOrg, setCompany, upsertDepartment } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

const role = z.object({ title: z.string(), count: z.number().int().min(1).default(1) });

export default defineAction({
  description:
    "Build (or rebuild) the company twin from your understanding of the company: sets the company profile and creates one department per team. Use when the user describes their company, pastes an org chart, or asks to start over. Estimate hoursAutomatable = realistic hours per week AI could take off that team's plate. replace=true (default) clears the existing org, skills, workflows, runs and requests first.",
  schema: z.object({
    company: z.object({
      name: z.string().min(1),
      description: z.string().default("").describe("One or two sentences about what the company does"),
    }),
    departments: z
      .array(
        z.object({
          name: z.string().min(1),
          emoji: z.string().default("🏢").describe("One emoji for the building"),
          mission: z.string().default("").describe("What this team is responsible for, one sentence"),
          headcount: z.number().int().min(1).default(3),
          hoursAutomatable: z.number().int().min(0).max(2000).default(10),
          roles: z.array(role).default([]),
        }),
      )
      .min(1)
      .max(12),
    replace: z.boolean().default(true),
  }),
  run: async (args, ctx) => {
    const me = owner(ctx);
    if (args.replace) await resetOrg(me);
    await setCompany(me, args.company);
    for (const d of args.departments) await upsertDepartment(me, d);
    const snap = await getSnapshot(me);
    return {
      company: snap.company,
      departments: snap.departments.map((d) => ({ id: d.id, name: d.name })),
      next: "The map now shows one building per department. Offer to add skills for the busiest teams or design a cross-team workflow.",
    };
  },
});
