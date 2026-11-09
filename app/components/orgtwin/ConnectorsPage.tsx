import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";

import type { OrgSnapshot } from "../../../shared/types";
import { ConnectTab } from "./OrgPanel";

/** Connectors (one-click Connect), MCP and A2A in one place. */
export function ConnectorsPage() {
  useSetPageTitle("Connectors");
  const { data: org } = useActionQuery<OrgSnapshot>("get-org", {});
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-2 px-4 py-6 sm:px-6">
        <header className="mb-4 space-y-1">
          <h1 className="text-xl font-semibold">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            The tools your teams' AI teammates can use, other AI apps connected over MCP, and outside agents over A2A.
          </p>
        </header>
        {org ? <ConnectTab org={org} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}
