import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getSnapshot, resolveDepartmentId } from "../server/org/store.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Get the A2A agent card of one department's agent: who it is and the skills it offers. Other agents (inside OrgTwin or outside over A2A/MCP) use it to decide which team to hand work to.",
  schema: z.object({ departmentId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ departmentId }, ctx) => {
    const me = owner(ctx);
    const id = await resolveDepartmentId(me, departmentId);
    const snap = await getSnapshot(me);
    const dept = snap.departments.find((d) => d.id === id)!;
    return {
      protocolVersion: "0.3",
      name: `${dept.name} agent`,
      description: `${dept.mission || dept.name} — part of ${snap.company?.name ?? "the company"} in OrgTwin.`,
      url: "/_agent-native/a2a",
      capabilities: { streaming: true },
      defaultInputModes: ["text"],
      defaultOutputModes: ["text"],
      skills: snap.skills
        .filter((s) => s.departmentId === id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          tags: [dept.name.toLowerCase(), ...s.tools],
          examples: s.steps.slice(0, 2).map((st) => st.title),
        })),
    };
  },
});
