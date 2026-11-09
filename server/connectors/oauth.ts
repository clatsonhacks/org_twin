/**
 * One-click "Connect": the provider's own sign-in / "Allow access" screen in a popup, instead of pasting keys.
 *
 * Flow (OAuth 2.0 authorization code):
 *   1. The browser opens GET /api/oauth/<provider>/start in a popup. It redirects to the provider.
 *   2. The person signs in at Google / Stripe / Notion / Slack / Discord / HubSpot and clicks Allow.
 *   3. The provider sends the popup to GET /api/oauth/<provider>/callback. The code is swapped for a token,
 *      the token is saved as an encrypted app secret under the same key the connector already reads
 *      (SLACK_WEBHOOK_URL, STRIPE_SECRET_KEY, …), and the popup tells the app and closes.
 *
 * Telegram has no OAuth: the person opens a t.me link to the bot with a one-time code and presses Start; the
 * server sees "/start <code>" in the bot's updates and saves that chat.
 *
 * The admin registers OrgTwin once with each service (client id + secret, in .env or Settings). After that
 * nobody copies keys. Stripe stays test-mode only.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { deleteAppSecret, registerRequiredSecret, writeAppSecret } from "@agent-native/core/secrets";
import { resolveSecretDetailed } from "@agent-native/core/server";

import { CONNECTORS, secret } from "./registry.js";

/* ---------------- where a connection is stored ---------------- */

export interface StoreScope {
  scope: "workspace" | "user";
  scopeId: string;
  email: string;
  orgId: string | null;
}

export async function saveValues(where: StoreScope, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    await writeAppSecret({
      key,
      value,
      scope: where.scope,
      scopeId: where.scopeId,
      description: "Saved by OrgTwin Connect",
    });
  }
}

export async function removeValues(where: StoreScope, keys: string[]) {
  for (const key of keys) {
    await deleteAppSecret({ key, scope: where.scope, scopeId: where.scopeId }).catch(() => false);
  }
}

/* ---------------- providers ---------------- */

export type ProviderId = "google" | "stripe" | "notion" | "slack" | "discord" | "hubspot";
export type SignIn = ProviderId | "telegram";

interface Exchanged {
  values: Record<string, string>;
  message: string;
}

interface Provider {
  id: ProviderId;
  name: string;
  clientIdKey: string;
  clientSecretKey: string;
  /** Every secret this sign-in writes; removed on disconnect. */
  keys: string[];
  authorize: (clientId: string, redirectUri: string, state: string) => string;
  exchange: (c: { clientId: string; clientSecret: string; code: string; redirectUri: string }) => Promise<Exchanged>;
  revoke?: (c: { clientId: string; clientSecret: string }) => Promise<void>;
}

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
];
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const HUBSPOT_TOKEN = "https://api.hubapi.com/oauth/v1/token";
const NOTION_VERSION = "2022-06-28";

const url = (base: string, q: Record<string, string>) => `${base}?${new URLSearchParams(q)}`;
const form = (q: Record<string, string>) => new URLSearchParams(q);
const basic = (id: string, secretValue: string) => `Basic ${Buffer.from(`${id}:${secretValue}`).toString("base64")}`;

async function postForm<T = any>(endpoint: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...headers },
    body: form(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: unknown; error_description?: string };
  return { ok: res.ok, status: res.status, json };
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  google: {
    id: "google",
    name: "Google",
    clientIdKey: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretKey: "GOOGLE_OAUTH_CLIENT_SECRET",
    keys: ["GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_OAUTH_ACCOUNT", "GOOGLE_OAUTH_SCOPES"],
    authorize: (clientId, redirectUri, state) =>
      url("https://accounts.google.com/o/oauth2/v2/auth", {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      }),
    exchange: async ({ clientId, clientSecret, code, redirectUri }) => {
      const r = await postForm<{ access_token?: string; refresh_token?: string; id_token?: string; scope?: string }>(
        GOOGLE_TOKEN,
        { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" },
      );
      if (!r.ok) throw new Error(`Google did not accept the sign-in (HTTP ${r.status}).`);
      if (!r.json.refresh_token) {
        throw new Error(
          "Google did not give offline access. Remove OrgTwin at myaccount.google.com/permissions and connect again.",
        );
      }
      const email = r.json.id_token ? String(jwtClaims(r.json.id_token).email ?? "") : "";
      const granted = r.json.scope ?? "";
      const missing = [
        [GOOGLE_SCOPES[2]!, "Sheets"],
        [GOOGLE_SCOPES[3]!, "Gmail"],
      ]
        .filter(([s]) => !granted.includes(s!))
        .map(([, n]) => n);
      return {
        values: {
          GOOGLE_OAUTH_REFRESH_TOKEN: r.json.refresh_token,
          GOOGLE_OAUTH_ACCOUNT: email || "Google account",
          GOOGLE_OAUTH_SCOPES: granted,
        },
        message: missing.length
          ? `Connected ${email || "Google"}, but ${missing.join(" and ")} access was not allowed.`
          : `Connected ${email || "your Google account"}. Sheets and Gmail are ready.`,
      };
    },
  },
  stripe: {
    id: "stripe",
    name: "Stripe",
    clientIdKey: "STRIPE_CONNECT_CLIENT_ID",
    clientSecretKey: "STRIPE_CONNECT_SECRET_KEY",
    keys: ["STRIPE_SECRET_KEY", "STRIPE_OAUTH_ACCOUNT", "STRIPE_OAUTH_USER_ID"],
    authorize: (clientId, redirectUri, state) =>
      url("https://connect.stripe.com/oauth/authorize", {
        response_type: "code",
        client_id: clientId,
        scope: "read_write",
        redirect_uri: redirectUri,
        state,
      }),
    exchange: async ({ clientSecret, code }) => {
      if (!clientSecret.startsWith("sk_test_")) throw new Error("STRIPE_CONNECT_SECRET_KEY must be a test key (sk_test_…).");
      const r = await postForm<{ access_token?: string; livemode?: boolean; stripe_user_id?: string }>(
        "https://connect.stripe.com/oauth/token",
        { grant_type: "authorization_code", code },
        { Authorization: `Bearer ${clientSecret}` },
      );
      if (!r.ok) throw new Error(`Stripe did not accept the sign-in: ${r.json.error_description ?? r.status}`);
      const token = r.json.access_token ?? "";
      if (r.json.livemode || !token.startsWith("sk_test_")) {
        throw new Error("OrgTwin only uses Stripe in test mode. Turn on test mode and connect again.");
      }
      let name = r.json.stripe_user_id ?? "Stripe account";
      const acc = await fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${token}` } })
        .then((x) => (x.ok ? (x.json() as Promise<any>) : null))
        .catch(() => null);
      if (acc) name = acc.settings?.dashboard?.display_name || acc.business_profile?.name || acc.email || name;
      return {
        values: { STRIPE_SECRET_KEY: token, STRIPE_OAUTH_ACCOUNT: `${name} (test mode)`, STRIPE_OAUTH_USER_ID: r.json.stripe_user_id ?? "" },
        message: `Connected Stripe (${name}, test mode). Agents can draft invoices now.`,
      };
    },
    revoke: async ({ clientId, clientSecret }) => {
      const user = await secret("STRIPE_OAUTH_USER_ID");
      if (!user) return;
      await postForm(
        "https://connect.stripe.com/oauth/deauthorize",
        { client_id: clientId, stripe_user_id: user },
        { Authorization: `Bearer ${clientSecret}` },
      );
    },
  },
  notion: {
    id: "notion",
    name: "Notion",
    clientIdKey: "NOTION_OAUTH_CLIENT_ID",
    clientSecretKey: "NOTION_OAUTH_CLIENT_SECRET",
    keys: ["NOTION_TOKEN", "NOTION_DATABASE_ID", "NOTION_OAUTH_ACCOUNT"],
    authorize: (clientId, redirectUri, state) =>
      url("https://api.notion.com/v1/oauth/authorize", {
        client_id: clientId,
        response_type: "code",
        owner: "user",
        redirect_uri: redirectUri,
        state,
      }),
    exchange: async ({ clientId, clientSecret, code, redirectUri }) => {
      const res = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: { Authorization: basic(clientId, clientSecret), "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(20_000),
      });
      const tok = (await res.json().catch(() => ({}))) as { access_token?: string; workspace_name?: string };
      if (!res.ok || !tok.access_token) throw new Error(`Notion did not accept the sign-in (HTTP ${res.status}).`);
      const name = tok.workspace_name || "Notion workspace";
      const values: Record<string, string> = { NOTION_TOKEN: tok.access_token, NOTION_OAUTH_ACCOUNT: name };
      const dbs = await notionSearch(tok.access_token, "database").catch(() => []);
      if (dbs.length === 1) {
        values.NOTION_DATABASE_ID = dbs[0]!.id;
        return { values, message: `Connected ${name}. Agents will add pages to "${dbs[0]!.title}".` };
      }
      return { values, message: `Connected ${name}. Now pick the database agents should write to.` };
    },
  },
  slack: {
    id: "slack",
    name: "Slack",
    clientIdKey: "SLACK_CLIENT_ID",
    clientSecretKey: "SLACK_CLIENT_SECRET",
    keys: ["SLACK_WEBHOOK_URL", "SLACK_OAUTH_ACCOUNT"],
    authorize: (clientId, redirectUri, state) =>
      url("https://slack.com/oauth/v2/authorize", {
        client_id: clientId,
        scope: "incoming-webhook",
        redirect_uri: redirectUri,
        state,
      }),
    exchange: async ({ clientId, clientSecret, code, redirectUri }) => {
      const r = await postForm<{ ok?: boolean; error?: string; team?: { name?: string }; incoming_webhook?: { url?: string; channel?: string } }>(
        "https://slack.com/api/oauth.v2.access",
        { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri },
      );
      const hook = r.json.incoming_webhook;
      if (!r.json.ok || !hook?.url) throw new Error(`Slack did not accept the sign-in (${r.json.error ?? r.status}).`);
      const name = `${hook.channel ?? "#channel"} · ${r.json.team?.name ?? "Slack"}`;
      return {
        values: { SLACK_WEBHOOK_URL: hook.url, SLACK_OAUTH_ACCOUNT: name },
        message: `Connected Slack. Agents will post in ${name}.`,
      };
    },
  },
  discord: {
    id: "discord",
    name: "Discord",
    clientIdKey: "DISCORD_CLIENT_ID",
    clientSecretKey: "DISCORD_CLIENT_SECRET",
    keys: ["DISCORD_WEBHOOK_URL", "DISCORD_OAUTH_ACCOUNT"],
    authorize: (clientId, redirectUri, state) =>
      url("https://discord.com/oauth2/authorize", {
        client_id: clientId,
        response_type: "code",
        scope: "webhook.incoming",
        redirect_uri: redirectUri,
        state,
      }),
    exchange: async ({ clientId, clientSecret, code, redirectUri }) => {
      const r = await postForm<{ webhook?: { url?: string; name?: string } }>("https://discord.com/api/oauth2/token", {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });
      const hook = r.json.webhook;
      if (!r.ok || !hook?.url) throw new Error(`Discord did not accept the sign-in (HTTP ${r.status}).`);
      return {
        values: { DISCORD_WEBHOOK_URL: hook.url, DISCORD_OAUTH_ACCOUNT: hook.name || "Discord channel" },
        message: "Connected Discord. Agents will post in the channel you picked.",
      };
    },
    revoke: async () => {
      const hook = await secret("DISCORD_WEBHOOK_URL");
      if (hook.startsWith("https://discord.com/api/webhooks/")) {
        await fetch(hook, { method: "DELETE", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
      }
    },
  },
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    clientIdKey: "HUBSPOT_CLIENT_ID",
    clientSecretKey: "HUBSPOT_CLIENT_SECRET",
    keys: ["HUBSPOT_TOKEN", "HUBSPOT_OAUTH_REFRESH_TOKEN", "HUBSPOT_OAUTH_EXPIRES_AT", "HUBSPOT_OAUTH_ACCOUNT"],
    authorize: (clientId, redirectUri, state) =>
      url("https://app.hubspot.com/oauth/authorize", {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "crm.objects.contacts.read crm.objects.contacts.write",
        state,
      }),
    exchange: async ({ clientId, clientSecret, code, redirectUri }) => {
      const r = await postForm<{ access_token?: string; refresh_token?: string; expires_in?: number }>(HUBSPOT_TOKEN, {
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      });
      if (!r.ok || !r.json.access_token) throw new Error(`HubSpot did not accept the sign-in (HTTP ${r.status}).`);
      let name = "HubSpot portal";
      const info = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${r.json.access_token}`)
        .then((x) => (x.ok ? (x.json() as Promise<any>) : null))
        .catch(() => null);
      if (info) name = info.hub_domain || info.user || name;
      return {
        values: {
          HUBSPOT_TOKEN: r.json.access_token,
          HUBSPOT_OAUTH_REFRESH_TOKEN: r.json.refresh_token ?? "",
          HUBSPOT_OAUTH_EXPIRES_AT: String(Date.now() + ((r.json.expires_in ?? 1800) - 60) * 1000),
          HUBSPOT_OAUTH_ACCOUNT: name,
        },
        message: `Connected HubSpot (${name}). Agents can create and update contacts.`,
      };
    },
    revoke: async () => {
      const refresh = await secret("HUBSPOT_OAUTH_REFRESH_TOKEN");
      if (refresh) {
        await fetch(`https://api.hubapi.com/oauth/v1/refresh-tokens/${refresh}`, { method: "DELETE" }).catch(() => undefined);
      }
    },
  },
};

export const TELEGRAM_KEYS = ["TELEGRAM_CHAT_ID", "TELEGRAM_OAUTH_ACCOUNT"];

/** Which sign-in each connector uses. Google covers both Sheets and email (Gmail). */
export const CONNECTOR_SIGNIN: Partial<Record<string, SignIn>> = {
  sheets: "google",
  email: "google",
  stripe: "stripe",
  notion: "notion",
  slack: "slack",
  discord: "discord",
  hubspot: "hubspot",
  telegram: "telegram",
};

export const ACCOUNT_KEY: Record<SignIn, string> = {
  google: "GOOGLE_OAUTH_ACCOUNT",
  stripe: "STRIPE_OAUTH_ACCOUNT",
  notion: "NOTION_OAUTH_ACCOUNT",
  slack: "SLACK_OAUTH_ACCOUNT",
  discord: "DISCORD_OAUTH_ACCOUNT",
  hubspot: "HUBSPOT_OAUTH_ACCOUNT",
  telegram: "TELEGRAM_OAUTH_ACCOUNT",
};

export function isProvider(id: string): id is ProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id);
}

/** Is one-click sign-in turned on (client id + secret, or the Telegram bot token)? */
export async function signinReady(id: SignIn): Promise<boolean> {
  if (id === "telegram") return Boolean(await secret("TELEGRAM_BOT_TOKEN"));
  const p = PROVIDERS[id];
  return Boolean((await secret(p.clientIdKey)) && (await secret(p.clientSecretKey)));
}

export function signinEnv(id: SignIn): string[] {
  return id === "telegram" ? ["TELEGRAM_BOT_TOKEN"] : [PROVIDERS[id].clientIdKey, PROVIDERS[id].clientSecretKey];
}

let registered = false;
/** Let the admin set the client ids and secrets in Settings too (env vars of the same name also work). */
export function registerSigninSecrets() {
  if (registered) return;
  registered = true;
  for (const p of Object.values(PROVIDERS)) {
    for (const [key, label] of [
      [p.clientIdKey, `${p.name} OAuth client id (one-click Connect)`],
      [p.clientSecretKey, `${p.name} OAuth client secret (one-click Connect)`],
    ] as const) {
      try {
        registerRequiredSecret({
          key,
          label,
          description: `Turns on one-click "Connect with ${p.name}" for everyone in the workspace.`,
          scope: "workspace",
          kind: "api-key",
          required: false,
        });
      } catch {
        // Already registered (hot reload).
      }
    }
  }
}

/* ---------------- signed state (survives without server memory, bound to the person) ---------------- */

const STATE_TTL_MS = 10 * 60_000;
const stateKey =
  process.env.BETTER_AUTH_SECRET || process.env.A2A_SECRET || process.env.WORKSPACE_SECRETS_ENCRYPTION_KEY || randomBytes(32).toString("hex");

interface StatePayload {
  p: ProviderId;
  email: string;
  redirectUri: string;
  ts: number;
  n: string;
}

export function signState(payload: Omit<StatePayload, "ts" | "n">): string {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now(), n: randomBytes(8).toString("hex") })).toString("base64url");
  const mac = createHmac("sha256", stateKey).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState(state: string, provider: ProviderId, email: string): StatePayload {
  const [body = "", mac = ""] = state.split(".");
  const want = createHmac("sha256", stateKey).update(body).digest();
  let got: Buffer;
  try {
    got = Buffer.from(mac, "base64url");
  } catch {
    got = Buffer.alloc(0);
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error("This sign-in link is not valid. Click Connect again.");
  const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  if (p.p !== provider || p.email !== email) throw new Error("This sign-in was started by someone else. Click Connect again.");
  if (Date.now() - p.ts > STATE_TTL_MS) throw new Error("This sign-in link expired. Click Connect again.");
  return p;
}

/** Callback address registered with each provider: OAUTH_REDIRECT_BASE_URL, else the address the app is opened at. */
export function redirectUriFor(provider: ProviderId, requestOrigin: string): string {
  const base = (process.env.OAUTH_REDIRECT_BASE_URL?.trim() || requestOrigin).replace(/\/+$/, "");
  return `${base}/api/oauth/${provider}/callback`;
}

export async function startUrl(provider: ProviderId, email: string, requestOrigin: string): Promise<string> {
  const p = PROVIDERS[provider];
  const clientId = await secret(p.clientIdKey);
  if (!clientId || !(await secret(p.clientSecretKey))) {
    throw new Error(
      `One-click ${p.name} sign-in is not turned on yet. Set ${p.clientIdKey} and ${p.clientSecretKey} once (in .env or Settings).`,
    );
  }
  const redirectUri = redirectUriFor(provider, requestOrigin);
  return p.authorize(clientId, redirectUri, signState({ p: provider, email, redirectUri }));
}

export async function finish(provider: ProviderId, code: string, state: string, where: StoreScope): Promise<string> {
  const st = readState(state, provider, where.email);
  if (!code) throw new Error("No access was granted.");
  const p = PROVIDERS[provider];
  const out = await p.exchange({
    clientId: await secret(p.clientIdKey),
    clientSecret: await secret(p.clientSecretKey),
    code,
    redirectUri: st.redirectUri,
  });
  // A new sign-in replaces the old one completely (e.g. a Notion database from another workspace).
  await removeValues(where, p.keys.filter((k) => !(k in out.values)));
  await saveValues(where, out.values);
  if (provider === "google") googleCache.clear();
  return out.message;
}

export async function disconnectProvider(provider: SignIn, where: StoreScope) {
  if (provider === "telegram") {
    await removeValues(where, TELEGRAM_KEYS);
    return;
  }
  const p = PROVIDERS[provider];
  try {
    if (provider === "google") {
      const refresh = await secret("GOOGLE_OAUTH_REFRESH_TOKEN");
      if (refresh) await postForm("https://oauth2.googleapis.com/revoke", { token: refresh });
    } else if (p.revoke) {
      await p.revoke({ clientId: await secret(p.clientIdKey), clientSecret: await secret(p.clientSecretKey) });
    }
  } catch {
    // Forget it here even if the provider is unreachable.
  }
  await removeValues(where, p.keys);
  if (provider === "google") googleCache.clear();
}

/* ---------------- popup landing page ---------------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function popupPage(provider: string, ok: boolean, message: string): string {
  const payload = JSON.stringify({ source: "orgtwin-oauth", provider, ok, message }).replace(/</g, "\\u003c");
  const color = ok ? "#16a34a" : "#dc2626";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OrgTwin · ${ok ? "Connected" : "Not connected"}</title>
<style>:root{color-scheme:light dark}body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7fb;color:#1b1f2a}
@media (prefers-color-scheme:dark){body{background:#14161c;color:#e7e9ee}}
main{max-width:380px;padding:24px;text-align:center}b{color:${color};font-size:40px;display:block}small{opacity:.7}</style></head>
<body><main><b>${ok ? "✓" : "✕"}</b><p>${esc(message)}</p><p><small>You can close this window.</small></p></main>
<script>try{window.opener&&window.opener.postMessage(${payload},location.origin)}catch(e){}setTimeout(function(){window.close()},${ok ? 900 : 6000});</script>
</body></html>`;
}

/* ---------------- Google: access tokens, Gmail, sample sheet ---------------- */

const googleCache = new Map<string, { token: string; exp: number }>();

export async function googleConnected(): Promise<boolean> {
  return Boolean(await secret("GOOGLE_OAUTH_REFRESH_TOKEN"));
}

/** A Google access token for the signed-in account (refreshed as needed), or null if Google isn't connected. */
export async function googleUserToken(): Promise<string | null> {
  const refresh = await secret("GOOGLE_OAUTH_REFRESH_TOKEN");
  if (!refresh) return null;
  const hit = googleCache.get(refresh);
  if (hit && hit.exp > Date.now()) return hit.token;
  const r = await postForm<{ access_token?: string; expires_in?: number }>(GOOGLE_TOKEN, {
    client_id: await secret("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: await secret("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  if (!r.ok || !r.json.access_token) {
    throw new Error("Google access was revoked or expired. Reconnect Google in the Connect tab.");
  }
  googleCache.set(refresh, { token: r.json.access_token, exp: Date.now() + ((r.json.expires_in ?? 3600) - 60) * 1000 });
  return r.json.access_token;
}

const mimeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);

export async function gmailSend(to: string[], subject: string, text: string): Promise<{ id: string; from: string }> {
  const token = await googleUserToken();
  if (!token) throw new Error("Google is not connected.");
  const from = await secret("GOOGLE_OAUTH_ACCOUNT");
  const raw = [
    ...(from.includes("@") ? [`From: ${from}`] : []),
    `To: ${to.join(", ")}`,
    `Subject: ${mimeWord(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text).toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Gmail refused the email (HTTP ${res.status}).`);
  const j = (await res.json()) as { id: string };
  return { id: j.id, from };
}

export const SAMPLE_COLUMNS = ["id", "name", "company", "email", "notes", "deal_value", "status"];
const SAMPLE_ROWS = [
  ["L-001", "Ava Chen", "Brightline Logistics", "ava.chen@example.com", "Asked for a demo of route planning", "18000", "new"],
  ["L-002", "Marcus Bell", "Harbor Dental Group", "marcus.bell@example.com", "5 clinics, wants online booking", "9500", "new"],
  ["L-003", "Priya Nair", "Kestrel Analytics", "priya.nair@example.com", "Trial ends Friday", "24000", "qualified"],
  ["L-004", "Jonas Weber", "Alpine Outdoor Co.", "jonas.weber@example.com", "Needs EU invoicing", "6200", "new"],
  ["L-005", "Lena Ortiz", "Northwind Robotics", "lena.ortiz@example.com", "Referred by a customer", "31000", "qualified"],
];

/** Create a ready-made leads sheet in the connected Google Drive; returns its id. */
export async function createSampleSheet(): Promise<{ id: string; url: string }> {
  const token = await googleUserToken();
  if (!token) throw new Error("Connect Google first.");
  const h = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  const made = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ properties: { title: "OrgTwin CRM (sample leads)" } }),
  });
  if (!made.ok) throw new Error(`Could not create a sheet (HTTP ${made.status}).`);
  const { spreadsheetId } = (await made.json()) as { spreadsheetId: string };
  const put = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=RAW`,
    { method: "PUT", headers: h, body: JSON.stringify({ values: [SAMPLE_COLUMNS, ...SAMPLE_ROWS] }) },
  );
  if (!put.ok) throw new Error(`The sheet was created but the rows could not be written (HTTP ${put.status}).`);
  return { id: spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
}

/** Accept a sheet id or a full docs.google.com link. */
export function sheetIdFrom(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  return (m?.[1] ?? input).trim();
}

/* ---------------- HubSpot: short-lived tokens ---------------- */

/** A valid HubSpot token: a pasted private-app token, or the signed-in one (refreshed when it expires). */
export async function hubspotToken(): Promise<string> {
  const refresh = await resolveSecretDetailed("HUBSPOT_OAUTH_REFRESH_TOKEN").catch(() => null);
  const current = await secret("HUBSPOT_TOKEN");
  if (!refresh?.value) return current;
  if (current && Number(await secret("HUBSPOT_OAUTH_EXPIRES_AT")) > Date.now()) return current;
  const r = await postForm<{ access_token?: string; refresh_token?: string; expires_in?: number }>(HUBSPOT_TOKEN, {
    grant_type: "refresh_token",
    client_id: await secret("HUBSPOT_CLIENT_ID"),
    client_secret: await secret("HUBSPOT_CLIENT_SECRET"),
    refresh_token: refresh.value,
  });
  if (!r.ok || !r.json.access_token) throw new Error("HubSpot access expired. Reconnect HubSpot in the Connect tab.");
  if (refresh.source === "user" || refresh.source === "workspace") {
    const where = { scope: refresh.source, scopeId: refresh.scopeId ?? "" } as const;
    for (const [key, value] of Object.entries({
      HUBSPOT_TOKEN: r.json.access_token,
      HUBSPOT_OAUTH_REFRESH_TOKEN: r.json.refresh_token ?? refresh.value,
      HUBSPOT_OAUTH_EXPIRES_AT: String(Date.now() + ((r.json.expires_in ?? 1800) - 60) * 1000),
    })) {
      await writeAppSecret({ key, value, ...where, description: "Saved by OrgTwin Connect" });
    }
  }
  return r.json.access_token;
}

/* ---------------- Notion: pick or create the database ---------------- */

export interface NotionTarget {
  id: string;
  title: string;
  url: string;
}

function notionTitle(obj: any): string {
  if (Array.isArray(obj.title)) return obj.title.map((t: any) => t.plain_text ?? "").join("") || "Untitled";
  for (const prop of Object.values(obj.properties ?? {}) as any[]) {
    if (prop?.type === "title") return (prop.title ?? []).map((t: any) => t.plain_text ?? "").join("") || "Untitled";
  }
  return "Untitled";
}

export async function notionSearch(token: string, kind: "database" | "page"): Promise<NotionTarget[]> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "content-type": "application/json" },
    body: JSON.stringify({ filter: { property: "object", value: kind }, page_size: 50 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Notion search failed (HTTP ${res.status}).`);
  const j = (await res.json()) as { results: any[] };
  return j.results.map((x) => ({ id: x.id, title: notionTitle(x), url: x.url ?? "" }));
}

export async function notionCreateDatabase(token: string, pageId: string): Promise<NotionTarget> {
  const res = await fetch("https://api.notion.com/v1/databases", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "content-type": "application/json" },
    body: JSON.stringify({
      parent: { type: "page_id", page_id: pageId },
      title: [{ type: "text", text: { content: "OrgTwin" } }],
      properties: { Name: { title: {} }, Created: { created_time: {} } },
    }),
  });
  if (!res.ok) throw new Error(`Could not create the database (HTTP ${res.status}).`);
  const j = (await res.json()) as { id: string; url?: string };
  return { id: j.id, title: "OrgTwin", url: j.url ?? "" };
}

/* ---------------- Telegram: deep link to the bot ---------------- */

const tgPending = new Map<string, { ts: number; email: string }>();
let tgOffset = 0;

export async function telegramStart(email: string) {
  const token = await secret("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Telegram one-tap connect is not turned on yet. Set TELEGRAM_BOT_TOKEN once (in .env or Settings).");
  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => (r.ok ? (r.json() as Promise<any>) : null));
  const bot = me?.result?.username;
  if (!bot) throw new Error("The Telegram bot token is not valid.");
  const code = randomBytes(9).toString("hex").slice(0, 12);
  tgPending.set(code, { ts: Date.now(), email });
  return { code, bot, url: `https://t.me/${bot}?startgroup=${code}`, dmUrl: `https://t.me/${bot}?start=${code}` };
}

/** Look for "/start <code>" in the bot's updates; when found, that chat is where agents post. */
export async function telegramCheck(code: string, where: StoreScope): Promise<{ connected: boolean; account?: string }> {
  const pending = tgPending.get(code);
  if (!pending || pending.email !== where.email || Date.now() - pending.ts > STATE_TTL_MS) {
    throw new Error("This link expired. Click Connect again.");
  }
  const token = await secret("TELEGRAM_BOT_TOKEN");
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?offset=${tgOffset}&timeout=0&allowed_updates=${encodeURIComponent('["message"]')}`,
  );
  if (!res.ok) throw new Error(`Telegram getUpdates failed (HTTP ${res.status}).`);
  const j = (await res.json()) as { result?: any[] };
  for (const u of j.result ?? []) {
    tgOffset = Math.max(tgOffset, u.update_id + 1);
    const text = String(u.message?.text ?? "").trim();
    if (!text.startsWith("/start")) continue;
    const arg = text.split(/\s+/).pop()?.split("@")[0];
    if (arg !== code) continue;
    const chat = u.message.chat;
    const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || "chat";
    tgPending.delete(code);
    await saveValues(where, { TELEGRAM_CHAT_ID: String(chat.id), TELEGRAM_OAUTH_ACCOUNT: name });
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat.id, text: "✅ OrgTwin is connected. Agents will post here." }),
    }).catch(() => undefined);
    return { connected: true, account: name };
  }
  return { connected: false };
}

/* ---------------- manual keys ---------------- */

/** Keys a person may save for a connector from the Connect dialog (only that connector's own fields). */
export function manualKeys(connectorId: string): string[] {
  return CONNECTORS.find((c) => c.id === connectorId)?.secrets.map((s) => s.key) ?? [];
}
