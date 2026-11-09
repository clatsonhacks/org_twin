import { defineEventHandler, HTTPError } from "h3";

import { createSampleSheet, saveValues } from "../../../../connectors/oauth.js";
import { asPerson, storeScopeFor } from "../../../../connectors/scope.js";

/** Make "OrgTwin CRM (sample leads)" in the connected Google Drive and use it as the default sheet. */
export default defineEventHandler(async (event) => {
  const where = await storeScopeFor(event);
  try {
    const sheet = await asPerson(where, () => createSampleSheet());
    await saveValues(where, { GOOGLE_SHEET_ID: sheet.id });
    return { ok: true, ...sheet, message: 'Created "OrgTwin CRM (sample leads)" in your Google Drive and connected it.' };
  } catch (e) {
    throw new HTTPError({ status: 409, message: (e as Error).message });
  }
});
