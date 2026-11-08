import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant } from "../server/connectors/registry.js";
import { appendRow } from "../server/connectors/sheets.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description: "Append a row to the connected Google Sheet; values keyed by column header. The user approves first.",
  schema: z.object({
    spreadsheetId: z.string().optional().describe("Defaults to GOOGLE_SHEET_ID"),
    sheet: z.string().optional().describe("Tab name; defaults to the first tab"),
    values: z.record(z.string(), z.string()),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ skillId, ...opts }, ctx) => {
    await requireGrant(owner(ctx), skillId, "sheets");
    return appendRow(opts);
  },
});
