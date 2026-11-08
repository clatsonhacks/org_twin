import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { getSnapshot } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "See what the user is looking at: the current view, the selected department (?dept=) and its skills, the open panel (?panel=), and the active run if any. Basic navigation is already in <current-screen>; call this for the details.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async (_args, ctx) => {
    const [navigation, url] = await Promise.all([readAppState("navigation"), readAppState("__url__")]);
    const params = ((url as { searchParams?: Record<string, string> } | null)?.searchParams ?? {}) as Record<
      string,
      string
    >;
    const screen: Record<string, unknown> = { navigation, searchParams: params };
    try {
      const snap = await getSnapshot(owner(ctx));
      screen.company = snap.company;
      screen.stats = snap.stats;
      if (params.dept) {
        const dept = snap.departments.find((d) => d.id === params.dept);
        if (dept) {
          screen.selectedDepartment = {
            ...dept,
            skills: snap.skills.filter((s) => s.departmentId === dept.id).map((s) => ({ id: s.id, name: s.name })),
          };
        }
      }
      const active = snap.runs.find((r) => r.status === "running" || r.status === "waiting_approval");
      if (active) {
        screen.activeRun = { id: active.id, name: active.name, status: active.status, currentStep: active.currentStep };
      }
    } catch {
      // Signed-out or empty database: navigation alone is still useful.
    }
    return screen;
  },
});
