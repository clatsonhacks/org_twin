import { requireUserEmail } from "../../server/org/store.js";

export function owner(ctx: { userEmail?: string } | undefined): string {
  return requireUserEmail(ctx?.userEmail);
}
