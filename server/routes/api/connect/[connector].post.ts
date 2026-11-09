import { readBody } from "@agent-native/core/server";
import { defineEventHandler, getRouterParam, HTTPError } from "h3";

import { manualKeys, saveValues, sheetIdFrom } from "../../../connectors/oauth.js";
import { asPerson, storeScopeFor } from "../../../connectors/scope.js";
import { connectorStatus } from "../../../connectors/registry.js";

/** "Use a key instead": save the keys typed into the Connect dialog (only that connector's own fields). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "connector") ?? "";
  const allowed = manualKeys(id);
  if (!allowed.length) throw new HTTPError({ status: 404, message: "Unknown connector." });
  const body = (await readBody<{ values?: Record<string, unknown> }>(event)) ?? {};
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(body.values ?? {})) {
    if (!allowed.includes(key)) continue;
    let v = typeof raw === "boolean" ? String(raw) : String(raw ?? "").trim();
    if (!v) continue;
    if (key === "GOOGLE_SHEET_ID") v = sheetIdFrom(v);
    if (key === "STRIPE_SECRET_KEY" && !/^(sk|rk)_test_/.test(v)) {
      throw new HTTPError({ status: 400, message: "Only Stripe TEST keys (sk_test_… or rk_test_…) are allowed." });
    }
    if (key === "WEBHOOK_ENABLED" && v !== "true" && v !== "false") v = "false";
    if (v.length > 20_000) throw new HTTPError({ status: 400, message: `${key} is too long.` });
    values[key] = v;
  }
  if (!Object.keys(values).length) throw new HTTPError({ status: 400, message: "Nothing to save." });
  const where = await storeScopeFor(event);
  await saveValues(where, values);
  const status = await asPerson(where, () => connectorStatus());
  const row = status.find((c) => c.id === id);
  return {
    ok: Boolean(row?.connected),
    message: row?.connected ? `${row.name} is connected.` : `Saved. Still needed: ${row?.missing.join(", ")}.`,
  };
});
