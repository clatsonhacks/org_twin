import { defineEventHandler, getQuery, getRouterParam } from "h3";

import { finish, isProvider, popupPage } from "../../../../connectors/oauth.js";
import { asPerson, storeScopeFor } from "../../../../connectors/scope.js";

const page = (provider: string, ok: boolean, message: string) =>
  new Response(popupPage(provider, ok, message), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });

/** Where the provider sends the popup back: swap the code for a token, save it, tell the app, close. */
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, "provider") ?? "";
  if (!isProvider(provider)) return page(provider, false, "Unknown sign-in provider.");
  const q = getQuery(event) as Record<string, string | undefined>;
  if (q.error) {
    const why = q.error === "access_denied" ? "Access was not allowed." : `The provider said: ${q.error_description || q.error}`;
    return page(provider, false, why);
  }
  try {
    const where = await storeScopeFor(event);
    const message = await asPerson(where, () => finish(provider, q.code ?? "", q.state ?? "", where));
    return page(provider, true, message);
  } catch (e) {
    return page(provider, false, (e as Error).message);
  }
});
