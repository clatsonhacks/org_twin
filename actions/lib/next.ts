import type { Run } from "../../shared/types.js";

/** A short instruction for the agent about what to do after a run changed. */
export function nextHint(run: Run): string {
  if (run.status === "done") {
    return "Run finished. Summarise the outputs for the user in 2-3 lines and mention the minutes saved.";
  }
  if (run.status === "rejected") {
    return "Run stopped (rejected or cancelled). Tell the user briefly; do not continue.";
  }
  const step = run.steps[run.currentStep]!;
  if (run.status === "waiting_approval") {
    return `STOP. Step ${run.currentStep + 1} "${step.title}" needs a person to approve it on the map (department ${step.departmentId}). You cannot approve it yourself. Tell the user what they are approving and end your turn.`;
  }
  return `Now do step ${run.currentStep + 1} "${step.title}" as the ${step.departmentId} agent: ${step.instructions || "use the previous outputs"}. Then call complete-step with runId="${run.id}", stepIndex=${run.currentStep}, the concrete output, and an honest minutesSaved estimate.`;
}
