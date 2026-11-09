import { KnowledgeGraph } from "@/components/orgtwin/KnowledgeGraph";
import { WorkspaceGate } from "@/components/orgtwin/WorkspaceGate";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Knowledge graph — ${APP_TITLE}` }];
}

export default function GraphRoute() {
  return (
    <WorkspaceGate>
      <KnowledgeGraph />
    </WorkspaceGate>
  );
}
