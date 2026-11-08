/**
 * Accept the Vultr variable names (VULTR_INFERENCE_*) as well as the framework's OpenAI-compatible ones.
 * Vultr Serverless Inference is OpenAI-compatible, so the agent runs on it through the OpenAI engine.
 * Explicit OPENAI_* / AGENT_* values always win.
 */
export function applyVultrEnvAliases(env: NodeJS.ProcessEnv = process.env): void {
  const key = env.VULTR_INFERENCE_API_KEY?.trim();
  if (!key) return;
  env.OPENAI_API_KEY ||= key;
  env.OPENAI_BASE_URL ||= env.VULTR_INFERENCE_BASE_URL?.trim() || "https://api.vultrinference.com/v1";
  env.AGENT_ENGINE ||= "ai-sdk:openai";
  env.AGENT_ENGINE_PREFER_BYO_KEY ||= "true";
  if (env.VULTR_INFERENCE_MODEL?.trim()) env.AGENT_MODEL ||= env.VULTR_INFERENCE_MODEL.trim();
}

applyVultrEnvAliases();
