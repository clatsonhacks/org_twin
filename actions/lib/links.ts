import { buildDeepLink } from "@agent-native/core/server";

/** Deep link that opens the map with a team, tab or run selected. */
export function mapLink(params: { dept?: string; panel?: string; label: string }) {
  const sp = new URLSearchParams();
  if (params.dept) sp.set("dept", params.dept);
  if (params.panel) sp.set("panel", params.panel);
  const to = `/home${sp.size ? `?${sp}` : ""}`;
  return { url: buildDeepLink({ view: "home", to, params: { dept: params.dept, panel: params.panel } }), label: params.label };
}
