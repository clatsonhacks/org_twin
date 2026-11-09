import { readBody } from "@agent-native/core/server";
import { defineEventHandler, HTTPError } from "h3";

import { telegramCheck } from "../../../../connectors/oauth.js";
import { asPerson, storeScopeFor } from "../../../../connectors/scope.js";

/** Has someone pressed Start with this code yet? If so, that chat is saved. */
export default defineEventHandler(async (event) => {
  const { code = "" } = (await readBody<{ code?: string }>(event)) ?? {};
  const where = await storeScopeFor(event);
  try {
    return await asPerson(where, () => telegramCheck(String(code), where));
  } catch (e) {
    throw new HTTPError({ status: 409, message: (e as Error).message });
  }
});
