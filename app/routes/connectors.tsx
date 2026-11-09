import { ConnectorsPage } from "@/components/orgtwin/ConnectorsPage";
import { WorkspaceGate } from "@/components/orgtwin/WorkspaceGate";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Connectors — ${APP_TITLE}` }];
}

export default function ConnectorsRoute() {
  return (
    <WorkspaceGate>
      <ConnectorsPage />
    </WorkspaceGate>
  );
}
