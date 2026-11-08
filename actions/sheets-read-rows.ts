import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { readRows } from "../server/connectors/sheets.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Read rows from the connected Google Sheet as objects keyed by the header row, optionally filtered (column = value, case-insensitive).",
  schema: z.object({
    spreadsheetId: z.string().optional().describe("Defaults to GOOGLE_SHEET_ID"),
    sheet: z.string().optional().describe("Tab name; defaults to the first tab"),
    where: z.record(z.string(), z.string()).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  readOnly: true,
  run: async ({ where, limit, skillId, ...opts }, ctx) => {
    await requireGrant(owner(ctx), skillId, "sheets");
    const { header, rows } = await readRows(opts);
    const match = (r: Record<string, unknown>) =>
      Object.entries(where ?? {}).every(([k, v]) => {
        const key = header.find((h) => h.toLowerCase() === k.toLowerCase()) ?? k;
        return String(r[key] ?? "").toLowerCase() === v.toLowerCase();
      });
    const hits = rows.filter(match);
    return { header, total: hits.length, rows: hits.slice(0, limit) };
  },
});
