import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

import { requireSecret, secret } from "./registry.js";
import { httpJson } from "./http.js";

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const raw = await requireSecret("GOOGLE_SERVICE_ACCOUNT_JSON", "Google Sheets");
  let sa: { client_email: string; private_key: string };
  const value = raw.trim();
  // A path to the downloaded key file (e.g. /secrets/google-sa.json or C:\keys\sa.json).
  if (/\.json$/i.test(value) && !value.startsWith("{")) {
    let text: string;
    try {
      text = await readFile(value, "utf8");
    } catch {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON points to ${value}, but that file can't be read.`);
    }
    try {
      sa = JSON.parse(text);
    } catch {
      throw new Error(`${value} is not valid service account JSON.`);
    }
  } else {
    try {
      // Either the JSON itself, or (as in a .env) base64 of it.
      sa = JSON.parse(value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8"));
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON must contain the service account JSON, its base64, or a path to the .json key file.",
      );
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google sign-in for the service account failed.");
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function sheetId(override?: string) {
  return override || (await secret("GOOGLE_SHEET_ID")) || (() => { throw new Error("No spreadsheet id (GOOGLE_SHEET_ID)."); })();
}

const api = (id: string, path: string) => `https://sheets.googleapis.com/v4/spreadsheets/${id}/${path}`;

export async function readRows(opts: { spreadsheetId?: string | undefined; sheet?: string | undefined }) {
  const id = await sheetId(opts.spreadsheetId);
  const token = await accessToken();
  const range = encodeURIComponent(`${opts.sheet ? `'${opts.sheet}'!` : ""}A1:Z1000`);
  const res = await httpJson<{ values?: string[][] }>(api(id, `values/${range}`), { headers: { Authorization: `Bearer ${token}` } }, "Google Sheets");
  const [header = [], ...rows] = res.values ?? [];
  return {
    id,
    header,
    rows: rows.map((r, i) => ({ row: i + 2, ...Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])) })),
  };
}

function colLetter(n: number) {
  let s = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export async function updateCell(opts: { spreadsheetId?: string | undefined; sheet?: string | undefined; row: number; column: string; value: string }) {
  const { id, header } = await readRows(opts);
  const idx = header.findIndex((h) => h.toLowerCase() === opts.column.toLowerCase());
  if (idx < 0) throw new Error(`No column "${opts.column}". Columns: ${header.join(", ")}`);
  const token = await accessToken();
  const range = encodeURIComponent(`${opts.sheet ? `'${opts.sheet}'!` : ""}${colLetter(idx)}${opts.row}`);
  await httpJson(api(id, `values/${range}?valueInputOption=USER_ENTERED`), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    json: { values: [[opts.value]] },
  }, "Google Sheets");
  return { updated: `${header[idx]} row ${opts.row}` };
}

export async function appendRow(opts: { spreadsheetId?: string | undefined; sheet?: string | undefined; values: Record<string, string> }) {
  const { id, header } = await readRows(opts);
  const token = await accessToken();
  const range = encodeURIComponent(`${opts.sheet ? `'${opts.sheet}'!` : ""}A1`);
  await httpJson(api(id, `values/${range}:append?valueInputOption=USER_ENTERED`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    json: { values: [header.map((h) => opts.values[h] ?? "")] },
  }, "Google Sheets");
  return { appended: true };
}
