/** Direct calls to Vultr Serverless Inference (OpenAI-compatible) for non-chat jobs, e.g. reading screenshots. */

function config() {
  const apiKey = (process.env.VULTR_INFERENCE_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = (
    process.env.VULTR_INFERENCE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.vultrinference.com/v1"
  ).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

export function inferenceConfigured(): boolean {
  return Boolean(config().apiKey);
}

let cachedVision: string | null | undefined;

/** VULTR_VISION_MODEL, else the first model on the subscription whose name suggests vision support. */
export async function visionModel(): Promise<string | null> {
  const pinned = process.env.VULTR_VISION_MODEL?.trim();
  if (pinned) return pinned;
  if (cachedVision !== undefined) return cachedVision;
  const { apiKey, baseUrl } = config();
  if (!apiKey) return null;
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = (await res.json()) as { data?: Array<{ id: string }> };
    const ids = (body.data ?? []).map((m) => m.id);
    cachedVision = ids.find((id) => /vl|vision|mimo|llava|pixtral|gemma-3|omni/i.test(id)) ?? null;
  } catch {
    cachedVision = null;
  }
  return cachedVision;
}

export async function describeImages(prompt: string, images: string[], maxTokens = 1500) {
  const model = await visionModel();
  if (!model) return null;
  const { apiKey, baseUrl } = config();
  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ],
  };
  const effort = process.env.VULTR_REASONING_EFFORT?.trim();
  if (effort) body.reasoning_effort = effort;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Vultr vision model returned HTTP ${res.status}.`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return { model, text: json.choices?.[0]?.message?.content ?? "", usage: json.usage };
}
