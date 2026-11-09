import { defineAction } from "@agent-native/core/action";
import { ACTION_CHAT_UI_DATA_CHART_RENDERER } from "@agent-native/core/action-ui";
import { createDataChartWidgetResult } from "@agent-native/core/data-widgets";
import { z } from "zod";

import { getSnapshot } from "../server/org/store.js";
import { mapLink } from "./lib/links.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Chart, per department, the hours OrgTwin's agents have actually saved so far (finished run steps + requests answered with a skill, at the time each usually takes by hand). Use for 'where does AI help most?' or impact questions; it renders as a chart in chat.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  chatUI: { renderer: ACTION_CHAT_UI_DATA_CHART_RENDERER, title: "AI impact by team" },
  run: async (_args, ctx) => {
    const snap = await getSnapshot(owner(ctx));
    const byDept = snap.stats.savedMinutesByDept;
    return createDataChartWidgetResult({
      title: `${snap.company?.name ?? "Company"}: time AI has saved by team`,
      chartSeries: {
        type: "bar",
        title: "Hours saved so far (finished run steps and answered requests)",
        xKey: "team",
        series: [{ key: "saved", label: "Saved so far (h)" }],
        data: snap.departments.map((d) => ({
          team: d.name,
          saved: Math.round(((byDept[d.id] ?? 0) / 60) * 10) / 10,
        })),
      },
    });
  },
  link: () => mapLink({ label: "Open the company map" }),
});
