import { defineEventHandler, getRouterParam, HTTPError } from "h3";

import { ACCOUNT_KEY, CONNECTOR_SIGNIN, disconnectProvider, manualKeys, removeValues } from "../../../connectors/oauth.js";
import { connectorStatus, secret } from "../../../connectors/registry.js";
import { asPerson, storeScopeFor } from "../../../connectors/scope.js";

/** Disconnect: undo a sign-in (and revoke it where the provider allows), or forget keys saved in the app. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "connector") ?? "";
  const keys = manualKeys(id);
  if (!keys.length) throw new HTTPError({ status: 404, message: "Unknown connector." });
  const where = await storeScopeFor(event);
  return asPerson(where, async () => {
    const signin = CONNECTOR_SIGNIN[id];
    if (signin && (await secret(ACCOUNT_KEY[signin]))) await disconnectProvider(signin, where);
    else await removeValues(where, keys);
    const row = (await connectorStatus()).find((c) => c.id === id);
    return {
      ok: true,
      message: row?.connected
        ? `Disconnected here, but ${row.name} is still set in the server environment (.env).`
        : "Disconnected. Agents use demo mode for it again.",
    };
  });
});
