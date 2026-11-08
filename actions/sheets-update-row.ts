import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { updateCell } from "../server/connectors/sheets.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Set one cell of the connected Google Sheet: row number (from sheets-read-rows) + column header. The user approves first.",
  schema: z.object({
    spreadsheetId: z.string().optional().describe("Defaults to GOOGLE_SHEET_ID"),
    sheet: z.string().optional().describe("Tab name; defaults to the first tab"),
    row: z.number().int().min(2),
    column: z.string(),
    value: z.string(),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ skillId, ...opts }, ctx) => {
    await requireGrant(owner(ctx), skillId, "sheets");
    return updateCell(opts);
  },
});
