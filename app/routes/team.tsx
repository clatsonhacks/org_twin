import { TeamHub } from "@/components/orgtwin/TeamHub";
import { WorkspaceGate } from "@/components/orgtwin/WorkspaceGate";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Team — ${APP_TITLE}` }];
}

export default function TeamRoute() {
  return (
    <WorkspaceGate>
      <TeamHub />
    </WorkspaceGate>
  );
}
