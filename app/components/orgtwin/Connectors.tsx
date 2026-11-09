import { useActionQuery } from "@agent-native/core/client/hooks";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@agent-native/toolkit/ui/dialog";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SignIn = "google" | "stripe" | "notion" | "slack" | "discord" | "hubspot" | "telegram";

export interface ConnectorRow {
  id: string;
  name: string;
  emoji: string;
  what: string;
  connected: boolean;
  missing: string[];
  signin: SignIn | null;
  signinReady: boolean;
  signinEnv: string[];
  account: string;
  fields: Array<{ key: string; label: string; optional: boolean; docsUrl: string; set: boolean }>;
}

type Result = { ok: boolean; message: string };

const SIGNIN_NAME: Record<SignIn, string> = {
  google: "Google",
  stripe: "Stripe",
  notion: "Notion",
  slack: "Slack",
  discord: "Discord",
  hubspot: "HubSpot",
  telegram: "Telegram",
};

/** What the person allows, in plain words, shown before they sign in. */
const PERMS: Record<string, string[]> = {
  sheets: ["📊 Read and update the Google Sheet you choose", "✉️ Also lets agents send email from your Gmail"],
  email: ["✉️ Send email from your Gmail, after you approve each one", "📊 Also connects Google Sheets"],
  stripe: ["🧾 Draft and send invoices in your Stripe account (test mode only)"],
  notion: ["📝 Add pages to the database you pick", "👀 Only the pages you share on the next screen"],
  slack: ["💬 Post messages in the channel you pick on the next screen"],
  discord: ["🎮 Post messages in the server channel you pick on the next screen"],
  hubspot: ["🧲 Find, create and update contacts in your HubSpot CRM"],
  telegram: ["✈️ The OrgTwin bot posts in the chat or group where you press Start"],
};

async function api<T = Result>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(json?.message || json?.statusMessage || `Request failed (HTTP ${res.status})`);
  return json as T;
}

/** Open the provider's sign-in screen in a popup and wait for the callback page to report back. */
function signInPopup(provider: SignIn): Promise<Result> {
  const w = 520;
  const h = 700;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  const popup = window.open(`/api/oauth/${provider}/start`, `orgtwin-${provider}`, `width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) return Promise.resolve({ ok: false, message: "The popup was blocked. Allow popups for this site and try again." });
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: Result) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      clearInterval(timer);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (e.origin === window.location.origin && d?.source === "orgtwin-oauth" && d.provider === provider) {
        finish({ ok: Boolean(d.ok), message: String(d.message ?? "") });
      }
    };
    window.addEventListener("message", onMsg);
    const timer = setInterval(() => {
      if (popup.closed) finish({ ok: false, message: "" });
    }, 700);
  });
}

/* ---------------- the list ---------------- */

export function ConnectorsSection() {
  const { data, refetch } = useActionQuery<{ connectors: ConnectorRow[] }>("list-connectors", {});
  const [openId, setOpenId] = useState<string | null>(null);
  const list = data?.connectors ?? [];
  const live = list.filter((c) => c.connected).length;
  const open = list.find((c) => c.id === openId) ?? null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">🔌 Connectors</h3>
      <p className="text-xs text-muted-foreground">
        <strong>{live}</strong> of {list.length} connected. The rest run in <strong>demo mode</strong> and only record what
        they would have sent. Click <strong>Connect</strong> to link your own account. Every send still waits for your
        approval, and a skill can only use the tools ticked on it.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
            <span className="text-lg" aria-hidden>
              {c.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{c.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {c.connected ? (c.account ? `Connected as ${c.account}` : c.what) : c.what}
              </span>
            </span>
            {c.id === "web" ? (
              <span className="text-[11px] font-medium text-emerald-600">● ready</span>
            ) : c.connected ? (
              <Button size="xs" variant="outline" onClick={() => setOpenId(c.id)} aria-label={`Manage ${c.name}`}>
                <span className="text-emerald-600">✓</span> Connected
              </Button>
            ) : (
              <Button size="xs" onClick={() => setOpenId(c.id)}>
                Connect
              </Button>
            )}
          </div>
        ))}
      </div>
      {open && (
        <ConnectDialog
          c={open}
          onClose={() => {
            setOpenId(null);
            void refetch();
          }}
          onChanged={() => void refetch()}
        />
      )}
    </section>
  );
}

/* ---------------- the dialog ---------------- */

function ConnectDialog({ c, onClose, onChanged }: { c: ConnectorRow; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<"" | "signin" | "save" | "sheet" | "off">("");
  const [msg, setMsg] = useState<Result | null>(null);
  const [manual, setManual] = useState(false);
  const tg = useRef({ cancelled: false });
  useEffect(() => () => void (tg.current.cancelled = true), []);

  const who = c.signin ? SIGNIN_NAME[c.signin] : "";
  const signedIn = Boolean(c.account);
  const canSignIn = Boolean(c.signin && c.signinReady);
  const showManual = !c.signin || !c.signinReady || manual;
  const editable = c.fields.length > 0 && c.id !== "web";

  const signIn = async () => {
    if (!c.signin) return;
    setBusy("signin");
    setMsg(null);
    const r = await signInPopup(c.signin);
    setBusy("");
    if (r.message) setMsg(r);
    onChanged();
  };

  const telegram = async (where: "group" | "dm") => {
    tg.current.cancelled = false;
    setBusy("signin");
    setMsg(null);
    const tab = window.open("", "orgtwin-telegram");
    try {
      const st = await api<{ code: string; url: string; dmUrl: string }>("POST", "/api/connect/telegram/start", {});
      const link = where === "group" ? st.url : st.dmUrl;
      if (tab && !tab.closed) tab.location.href = link;
      else window.open(link, "_blank", "noopener");
      const until = Date.now() + 9 * 60_000;
      while (!tg.current.cancelled && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 2500));
        const r = await api<{ connected: boolean; account?: string }>("POST", "/api/connect/telegram/check", { code: st.code });
        if (r.connected) {
          setMsg({ ok: true, message: `Connected to ${r.account}. Agents will post there.` });
          onChanged();
          return;
        }
      }
      if (!tg.current.cancelled) setMsg({ ok: false, message: "Didn't see the Start message. Click Connect to try again." });
    } catch (e) {
      tab?.close();
      setMsg({ ok: false, message: (e as Error).message });
    } finally {
      setBusy("");
    }
  };

  const save = async (values: Record<string, string>) => {
    setBusy("save");
    setMsg(null);
    try {
      setMsg(await api("POST", `/api/connect/${c.id}`, { values }));
      onChanged();
    } catch (e) {
      setMsg({ ok: false, message: (e as Error).message });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    const google = c.signin === "google" && signedIn;
    if (
      !window.confirm(
        google
          ? `Disconnect Google (${c.account})? Google Sheets and Gmail both go back to demo mode.`
          : `Disconnect ${c.name}? Agents use demo mode for it again.`,
      )
    ) {
      return;
    }
    setBusy("off");
    setMsg(null);
    try {
      setMsg(await api("DELETE", `/api/connect/${c.id}`));
      setManual(false);
      onChanged();
    } catch (e) {
      setMsg({ ok: false, message: (e as Error).message });
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              {c.emoji}
            </span>
            {c.connected ? c.name : `Connect ${c.name}`}
          </DialogTitle>
          <DialogDescription>{c.what}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {signedIn && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5">
              <span className="text-lg text-emerald-600" aria-hidden>
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Connected</span>
                <span className="block truncate text-xs text-muted-foreground">{c.account}</span>
              </span>
              {canSignIn && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => (c.signin === "telegram" ? telegram("group") : signIn())}
                >
                  {c.signin === "telegram" ? "Change chat" : "Switch account"}
                </Button>
              )}
            </div>
          )}

          {!signedIn && canSignIn && !manual && (
            <div className="space-y-3">
              <p>
                {c.signin === "telegram" ? (
                  <>
                    Tap the button, pick a chat in Telegram and press <strong>Start</strong>. No keys to copy.
                  </>
                ) : (
                  <>
                    Sign in with your {who} account and click <strong>Allow</strong>. No keys to copy.
                  </>
                )}
              </p>
              <ul className="space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                {(PERMS[c.id] ?? []).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                <li>🔒 You can disconnect any time</li>
              </ul>
              {c.signin === "telegram" ? (
                busy === "signin" ? (
                  <div className="space-y-2 text-center">
                    <p className="text-xs text-muted-foreground">
                      In Telegram, pick the chat and press <strong>Start</strong>. This updates by itself…
                    </p>
                    <Button size="sm" variant="outline" onClick={() => (tg.current.cancelled = true)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button className="w-full bg-[#2aabee] text-white hover:bg-[#229ed9]" onClick={() => telegram("group")}>
                      Add to a Telegram group
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => telegram("dm")}>
                      …or message me directly
                    </Button>
                  </div>
                )
              ) : (
                <Button className="w-full" size="lg" disabled={busy === "signin"} onClick={signIn}>
                  {busy === "signin" ? (
                    "Waiting for the sign-in window…"
                  ) : c.signin === "google" ? (
                    <>
                      <GoogleMark /> Sign in with Google
                    </>
                  ) : (
                    `Connect with ${who}`
                  )}
                </Button>
              )}
              {busy === "signin" && c.signin !== "telegram" && (
                <p className="text-center text-xs text-muted-foreground">
                  Finish in the popup. Nothing opened? Allow popups for this site and click again.
                </p>
              )}
              {editable && (
                <button className="block text-xs text-muted-foreground underline" onClick={() => setManual(true)}>
                  Use a key instead
                </button>
              )}
            </div>
          )}

          {!signedIn && c.signin && !c.signinReady && <SetupHint c={c} />}

          {c.id === "sheets" && signedIn && <SheetPicker busy={busy} setBusy={setBusy} onDone={(r) => (setMsg(r), onChanged())} />}
          {c.id === "notion" && signedIn && <NotionPicker onDone={(r) => (setMsg(r), onChanged())} />}

          {showManual && !signedIn && editable && (
            <ManualForm
              c={c}
              busy={busy === "save"}
              onSave={save}
              {...(canSignIn ? { onBack: () => setManual(false) } : {})}
            />
          )}

          {msg?.message && (
            <p role="status" className={msg.ok ? "text-emerald-600" : "text-red-600"}>
              {msg.ok ? "✓" : "✕"} {msg.message}
            </p>
          )}

          {(c.connected || signedIn) && c.id !== "web" && (
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button size="sm" variant="outline-destructive" disabled={Boolean(busy)} onClick={disconnect}>
                {busy === "off" ? "Disconnecting…" : "Disconnect"}
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One-click sign-in isn't registered yet: say exactly what the admin sets, and where the provider sends people back. */
function SetupHint({ c }: { c: ConnectorRow }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const who = c.signin ? SIGNIN_NAME[c.signin] : "";
  return (
    <details className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        One-click {who} sign-in isn't turned on yet{c.fields.length ? ", so use a key below" : ""}.
      </summary>
      <div className="mt-2 space-y-1.5">
        {c.signin === "telegram" ? (
          <p>
            The admin creates a bot with <strong>@BotFather</strong> once and sets <code>TELEGRAM_BOT_TOKEN</code> in{" "}
            <code>.env</code> or Settings. Then everyone connects by pressing Start in Telegram.
          </p>
        ) : (
          <>
            <p>
              The admin registers OrgTwin with {who} once and sets {c.signinEnv.map((k, i) => (
                <span key={k}>
                  {i > 0 && " and "}
                  <code>{k}</code>
                </span>
              ))}{" "}
              in <code>.env</code> or Settings, then restarts the app. After that, everyone just clicks Connect.
            </p>
            <p>
              Redirect URI to register: <code className="break-all">{`${origin}/api/oauth/${c.signin}/callback`}</code>
            </p>
          </>
        )}
      </div>
    </details>
  );
}

function ManualForm({
  c,
  busy,
  onSave,
  onBack,
}: {
  c: ConnectorRow;
  busy: boolean;
  onSave: (v: Record<string, string>) => void;
  onBack?: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const toggle = c.id === "webhook";
  const missing = c.fields.some((f) => !f.optional && !f.set && !String(vals[f.key] ?? "").trim() && f.key !== "WEBHOOK_ENABLED");
  const docs = c.fields.find((f) => f.docsUrl)?.docsUrl;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(toggle ? { ...vals, WEBHOOK_ENABLED: vals.WEBHOOK_ENABLED ?? "true" } : vals);
      }}
    >
      {docs && (
        <a href={docs} target="_blank" rel="noreferrer" className="text-xs underline">
          Where do I find this? ↗
        </a>
      )}
      {c.fields.map((f) =>
        f.key === "WEBHOOK_ENABLED" ? (
          <label key={f.key} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={(vals[f.key] ?? "true") === "true"}
              onChange={(e) => setVals({ ...vals, [f.key]: String(e.target.checked) })}
            />
            Allow webhook calls
          </label>
        ) : (
          <label key={f.key} className="block space-y-1">
            <span className="text-xs font-medium">
              {f.label}
              {f.optional && <span className="font-normal text-muted-foreground"> · optional</span>}
            </span>
            {f.key === "GOOGLE_SERVICE_ACCOUNT_JSON" ? (
              <textarea
                rows={3}
                spellCheck={false}
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
                placeholder={f.set ? "Saved. Leave empty to keep it." : '{"type": "service_account", …}'}
                value={vals[f.key] ?? ""}
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
              />
            ) : (
              <Input
                type={/TOKEN|PASSWORD|SECRET|KEY|JSON/.test(f.key) ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                placeholder={f.set ? "Saved. Leave empty to keep it." : f.key}
                value={vals[f.key] ?? ""}
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
              />
            )}
          </label>
        ),
      )}
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={onBack}>
            ← Sign in instead
          </button>
        )}
        <span className="flex-1" />
        <Button size="sm" type="submit" disabled={busy || missing}>
          {busy ? "Connecting…" : "Save & connect"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Saved encrypted on the server. Never shown to the browser or the agent.</p>
    </form>
  );
}

function SheetPicker({
  busy,
  setBusy,
  onDone,
}: {
  busy: string;
  setBusy: (b: "" | "sheet") => void;
  onDone: (r: Result) => void;
}) {
  const [link, setLink] = useState("");
  const sample = async () => {
    setBusy("sheet");
    try {
      onDone(await api("POST", "/api/connect/sheets/sample", {}));
    } catch (e) {
      onDone({ ok: false, message: (e as Error).message });
    } finally {
      setBusy("");
    }
  };
  const use = async () => {
    try {
      onDone(await api("POST", "/api/connect/sheets", { values: { GOOGLE_SHEET_ID: link.trim() } }));
      setLink("");
    } catch (e) {
      onDone({ ok: false, message: (e as Error).message });
    }
  };
  return (
    <div className="space-y-2 rounded-lg border px-3 py-3">
      <h4 className="text-xs font-semibold">Which sheet?</h4>
      <Button className="h-auto w-full flex-col py-2" disabled={Boolean(busy)} onClick={sample}>
        <span>{busy === "sheet" ? "Creating…" : "✨ Create a sample CRM sheet for me"}</span>
        <span className="text-[11px] font-normal opacity-80">The right columns and 5 sample leads, in your Drive</span>
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">or paste the link of a sheet you already have</p>
      <div className="flex gap-2">
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
        <Button size="sm" variant="outline" disabled={!link.trim()} onClick={use}>
          Use it
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Columns: id · name · company · email · notes · deal_value · status</p>
    </div>
  );
}

function NotionPicker({ onDone }: { onDone: (r: Result) => void }) {
  type Target = { id: string; title: string; url: string };
  const { data, error, refetch, isFetching } = useActionQuery<{ databases: Target[]; pages: Target[]; current: string }>(
    "list-notion-targets",
    {},
  );
  const [working, setWorking] = useState(false);
  const pick = async (body: { databaseId?: string; createInPage?: string }) => {
    setWorking(true);
    try {
      onDone(await api("POST", "/api/connect/notion/database", body));
      void refetch();
    } catch (e) {
      onDone({ ok: false, message: (e as Error).message });
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border px-3 py-3">
      <h4 className="text-xs font-semibold">{data?.current ? "Agents write to" : "Pick a database"}</h4>
      {!data && !error && <p className="text-xs text-muted-foreground">Loading what you shared…</p>}
      {error && <p className="text-xs text-red-600">{(error as Error).message}</p>}
      {data && data.databases.length > 0 && (
        <div className="grid gap-1">
          {data.databases.map((d) => {
            const on = d.id.replace(/-/g, "") === data.current;
            return (
              <Button key={d.id} size="sm" variant={on ? "secondary" : "outline"} className="justify-start" disabled={working} onClick={() => pick({ databaseId: d.id })}>
                🗂 {d.title} {on && "✓"}
              </Button>
            );
          })}
        </div>
      )}
      {data && data.pages.length > 0 && (
        <>
          <p className="text-[11px] text-muted-foreground">or create a new "OrgTwin" database inside a page</p>
          <div className="grid gap-1">
            {data.pages.slice(0, 8).map((p) => (
              <Button key={p.id} size="sm" variant="ghost" className="justify-start" disabled={working} onClick={() => pick({ createInPage: p.id })}>
                ＋ in "{p.title}"
              </Button>
            ))}
          </div>
        </>
      )}
      {data && !data.databases.length && !data.pages.length && (
        <p className="text-xs text-muted-foreground">
          Nothing was shared with OrgTwin. Click <strong>Switch account</strong> and tick a page or database on Notion's screen.
        </p>
      )}
      <button className="text-xs text-muted-foreground underline" disabled={isFetching} onClick={() => void refetch()}>
        ↻ Refresh list
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="mr-1.5 inline-block rounded-full bg-white p-px">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
