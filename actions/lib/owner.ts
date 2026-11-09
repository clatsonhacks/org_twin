import { requireUserEmail, workspaceKey } from "../../server/org/store.js";

type Ctx = { userEmail?: string; orgId?: string | null } | undefined;

/**
 * Who owns OrgTwin data for this call: the active workspace (organization), so everyone in it shares one
 * company map, skills, workflows and runs. Without a workspace it is the person's own email.
 */
export function owner(ctx: Ctx): string {
  const email = requireUserEmail(ctx?.userEmail);
  return ctx?.orgId ? workspaceKey(ctx.orgId) : email;
}

/** The signed-in person (for "approved by", AI limits, and anything that must name an individual). */
export function person(ctx: Ctx): string {
  return requireUserEmail(ctx?.userEmail);
}
