import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v === "::";
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Refuse URLs that point at private networks (SSRF guard) unless ALLOW_PRIVATE_URLS=true. */
export async function assertPublicUrl(raw: string, { allowHttp = false } = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL.");
  }
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new Error("Only https:// URLs are allowed.");
  }
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  if (process.env.ALLOW_PRIVATE_URLS === "true") return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private hosts are not allowed.");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new Error(`Cannot resolve ${host}.`);
  if (addrs.some((a) => privateAddress(a.address))) throw new Error("Private network addresses are not allowed.");
  return url;
}
