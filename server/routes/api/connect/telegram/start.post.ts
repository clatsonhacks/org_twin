import { defineEventHandler, HTTPError } from "h3";

import { telegramStart } from "../../../../connectors/oauth.js";
import { asPerson, storeScopeFor } from "../../../../connectors/scope.js";

/** One-tap Telegram: a t.me link to the bot with a one-time code. */
export default defineEventHandler(async (event) => {
  const where = await storeScopeFor(event);
  try {
    return await asPerson(where, () => telegramStart(where.email));
  } catch (e) {
    throw new HTTPError({ status: 409, message: (e as Error).message });
  }
});
