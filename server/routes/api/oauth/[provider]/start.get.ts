import { defineEventHandler, getRequestURL, getRouterParam } from "h3";

import { isProvider, popupPage, startUrl } from "../../../../connectors/oauth.js";
import { asPerson, storeScopeFor } from "../../../../connectors/scope.js";

const page = (provider: string, ok: boolean, message: string) =>
  new Response(popupPage(provider, ok, message), { headers: { "content-type": "text/html; charset=utf-8" } });

/** Opened in the Connect popup: sends the person to the provider's own sign-in / Allow screen. */
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, "provider") ?? "";
  if (!isProvider(provider)) return page(provider, false, "Unknown sign-in provider.");
  try {
    const where = await storeScopeFor(event);
    const target = await asPerson(where, () => startUrl(provider, where.email, getRequestURL(event).origin));
    return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
  } catch (e) {
    return page(provider, false, (e as Error).message);
  }
});
