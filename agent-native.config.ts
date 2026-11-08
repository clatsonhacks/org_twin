import { defineAgentNativeConfig } from "@agent-native/core/config";

// Accept the Vultr variable names in dev too (server/plugins/00-env.ts does the same at server start).
{
  const env = process.env;
  const key = env.VULTR_INFERENCE_API_KEY?.trim();
  if (key) {
    env.OPENAI_API_KEY ||= key;
    env.OPENAI_BASE_URL ||= env.VULTR_INFERENCE_BASE_URL?.trim() || "https://api.vultrinference.com/v1";
    env.AGENT_ENGINE ||= "ai-sdk:openai";
    env.AGENT_ENGINE_PREFER_BYO_KEY ||= "true";
    if (env.VULTR_INFERENCE_MODEL?.trim()) env.AGENT_MODEL ||= env.VULTR_INFERENCE_MODEL.trim();
  }
}

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
});
