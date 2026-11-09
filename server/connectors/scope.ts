import { getOrgContext } from "@agent-native/core/org";
import { getSession, runWithRequestContext } from "@agent-native/core/server";
import { HTTPError, type H3Event } from "h3";

import type { StoreScope } from "./oauth.js";

/**
 * Where a connection made from the Connect tab is saved, using the same rule as Settings → secrets:
 * org owners and admins (and anyone without an org) save it for the whole workspace; other members save
 * it for themselves only. Connector code finds either through the normal secret lookup.
 */
export async function storeScopeFor(event: H3Event): Promise<StoreScope> {
  const session = await getSession(event).catch(() => null);
  const email = session?.email;
  if (!email) throw new HTTPError({ status: 401, message: "Sign in first." });
  const ctx = await getOrgContext(event).catch(() => null);
  const orgId = ctx?.orgId ?? null;
  if (!orgId) return { scope: "workspace", scopeId: `solo:${email}`, email, orgId };
  if (ctx?.role === "owner" || ctx?.role === "admin") return { scope: "workspace", scopeId: orgId, email, orgId };
  return { scope: "user", scopeId: email, email, orgId };
}

/** Run connector code as this person, so secret lookups see their workspace. */
export function asPerson<T>(where: StoreScope, fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(
    runWithRequestContext({ userEmail: where.email, ...(where.orgId ? { orgId: where.orgId } : {}) }, fn),
  );
}
