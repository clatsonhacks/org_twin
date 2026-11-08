import { emit, registerEvent } from "@agent-native/core/event-bus";
import { z } from "zod";

let registered = false;
/** App events people can build automations on ("when an approval is requested, post to Slack"). */
export function registerOrgTwinEvents() {
  if (registered) return;
  registered = true;
  registerEvent({
    name: "orgtwin.approval.requested",
    description: "A workflow run reached an approval step and is waiting for a person.",
    payloadSchema: z.object({ runId: z.string(), run: z.string(), step: z.string(), departmentId: z.string() }),
    example: { runId: "run_lead-to-cash_ab12c", run: "Lead to cash", step: "Finance approves the invoice", departmentId: "finance" },
  });
  registerEvent({
    name: "orgtwin.run.completed",
    description: "A workflow run finished (done or stopped).",
    payloadSchema: z.object({ runId: z.string(), run: z.string(), status: z.string(), minutesSaved: z.number() }),
    example: { runId: "run_lead-to-cash_ab12c", run: "Lead to cash", status: "done", minutesSaved: 115 },
  });
  registerEvent({
    name: "orgtwin.request.created",
    description: "Someone asked a team for work ('ask a team').",
    payloadSchema: z.object({ requestId: z.string(), fromName: z.string(), text: z.string() }),
    example: { requestId: "req_i-need-an-analysis_x1y2z", fromName: "Sam", text: "I need an analysis of Q3 churn" },
  });
}

export function emitOrgTwin(event: string, payload: Record<string, unknown>, owner: string) {
  try {
    emit(event, payload, { owner });
  } catch {
    // Events are best-effort; the app never depends on them.
  }
}
