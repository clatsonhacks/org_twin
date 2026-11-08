/** Small fetch wrapper: JSON in/out, timeout, and errors that never echo credentials. */
export async function httpJson<T = any>(
  url: string,
  init: RequestInit & { json?: unknown; timeoutMs?: number } = {},
  label = "request",
): Promise<T> {
  const { json, timeoutMs = 30_000, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(headers as any) },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = "";
    try {
      const j = JSON.parse(text);
      detail = j.message || j.error?.message || j.error || "";
    } catch {
      detail = text.slice(0, 200);
    }
    throw new Error(`${label} failed (HTTP ${res.status})${detail ? `: ${String(detail).slice(0, 300)}` : ""}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
