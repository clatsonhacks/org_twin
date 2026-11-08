import { sendToAgentChat } from "@agent-native/core/client/agent-chat";

/** Hand work to the in-app agent. The agent uses the same actions as the UI. */
export function askAgent(message: string, context?: string) {
  sendToAgentChat({ message, ...(context ? { context } : {}), submit: true, openSidebar: true });
}
