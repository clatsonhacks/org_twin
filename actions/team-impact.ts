import { defineAction } from "@agent-native/core/action";
import { ACTION_CHAT_UI_DATA_CHART_RENDERER } from "@agent-native/core/action-ui";
import { createDataChartWidgetResult } from "@agent-native/core/data-widgets";
import { z } from "zod";

import { getSnapshot } from "../server/org/store.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Chart, per department, the hours a week AI could take off the team versus the hours OrgTwin's agents have actually saved so far (runs + answered requests). Use for 'where does AI help most?' or impact questions; it renders as a chart in chat.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  chatUI: { renderer: ACTION_CHAT_UI_DATA_CHART_RENDERER, title: "AI impact by team" },
  run: async (_args, ctx) => {
    const snap = await getSnapshot(owner(ctx));
    const saved = new Map<string, number>();
    for (const r of snap.runs) {
      for (const s of r.steps) {
        if (s.status === "done") saved.set(s.departmentId, (saved.get(s.departmentId) ?? 0) + s.minutesSaved);
      }
    }
    for (const q of snap.requests) {
      if (q.status === "done" && q.departmentId) saved.set(q.departmentId, (saved.get(q.departmentId) ?? 0) + 30);
    }
    return createDataChartWidgetResult({
      title: `${snap.company?.name ?? "Company"}: AI impact by team`,
      chartSeries: {
        type: "bar",
        title: "Hours: automatable per week vs saved so far",
        xKey: "team",
        series: [
          { key: "automatable", label: "Automatable h/week" },
          { key: "saved", label: "Saved so far (h)" },
        ],
        data: snap.departments.map((d) => ({
          team: d.name,
          automatable: d.hoursAutomatable,
          saved: Math.round(((saved.get(d.id) ?? 0) / 60) * 10) / 10,
        })),
      },
    });
  },
  link: () => mapLink({ label: "Open the company map" }),
});
