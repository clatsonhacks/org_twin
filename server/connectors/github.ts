import { requireSecret, secret } from "./registry.js";
import { httpJson } from "./http.js";

export async function gh<T = any>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const token = await requireSecret("GITHUB_TOKEN", "GitHub");
  return httpJson<T>(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "orgtwin" },
  }, "GitHub");
}

export async function repoOf(repo?: string) {
  const r = repo || (await secret("GITHUB_REPO"));
  if (!r || !/^[\w.-]+\/[\w.-]+$/.test(r)) throw new Error("Give a repository as owner/name (or set GITHUB_REPO).");
  return r;
}
