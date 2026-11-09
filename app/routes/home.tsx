import OrgTwinPage from "@/components/orgtwin/OrgTwinPage";
import { WorkspaceGate } from "@/components/orgtwin/WorkspaceGate";

const SEO_TITLE = "OrgTwin — your company as a living map, run by people and agents";
const SEO_DESCRIPTION =
  "Describe your company and get a map of every team with its own AI teammate. Design cross-team workflows, run them, and approve the risky steps.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
  ];
}

export default function HomeRoute() {
  return (
    <WorkspaceGate>
      <OrgTwinPage />
    </WorkspaceGate>
  );
}
