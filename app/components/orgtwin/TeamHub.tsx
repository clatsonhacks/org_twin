import {
  useBulkInviteMembers,
  useChangeMemberRole,
  useOrg,
  useOrgInvitations,
  useOrgMembers,
  useOrgRole,
  useRemoveMember,
  useSetOrgDomain,
} from "@agent-native/core/client/org-team";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { IconCheck, IconCopy, IconMail, IconSearch, IconUserPlus, IconWorld } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Avatar } from "./WorkspaceGate";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;
const ROLE_HELP = {
  owner: "Everything, including roles and deleting the workspace",
  admin: "Invite and remove members, workspace settings, shared connectors",
  member: "Use the map, run workflows, approve steps, teach skills",
} as const;

/** The workspace's people: who is in it, invitations, roles and email-domain auto-join. */
export function TeamHub() {
  useSetPageTitle("Team");
  const { data: org } = useOrg();
  const { canInviteMembers, canManageDomain, isOwner } = useOrgRole();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">
            Everyone in <strong className="text-foreground">{org?.orgName ?? "this workspace"}</strong> shares the same
            company map, skills, workflows and approvals.
          </p>
        </header>
        {canInviteMembers && <InviteCard />}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <MembersCard me={org?.email ?? ""} canManage={canInviteMembers} isOwner={isOwner} />
          <div className="space-y-6">
            <PendingCard />
            {canManageDomain && <DomainCard current={org?.allowedDomain ?? null} />}
            <RolesCard />
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  action,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border bg-background shadow-sm ${className}`}>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        {icon}
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function InviteCard() {
  const { data: org } = useOrg();
  const invite = useBulkInviteMembers();
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [result, setResult] = useState<{ ok: string[]; failed: Array<{ email: string; error: string }>; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const list = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => /.+@.+\..+/.test(e));
  const link = typeof window !== "undefined" ? `${window.location.origin}/home` : "";

  const send = async () => {
    const r = await invite.mutateAsync(list.map((email) => ({ email, role })));
    setResult({ ok: r.succeeded.map((s) => s.email), failed: r.failed, emailSent: r.succeeded.some((s) => s.emailSent) });
    setEmails("");
  };

  return (
    <Card title="Invite people" icon={<IconUserPlus className="size-4" />}>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (list.length) void send();
        }}
      >
        <Input
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="name@company.com, another@company.com"
          aria-label="Email addresses"
          className="flex-1"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Role"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <Button type="submit" disabled={!list.length || invite.isPending}>
          {invite.isPending ? "Inviting…" : list.length > 1 ? `Invite ${list.length}` : "Invite"}
        </Button>
      </form>
      {invite.error && <p className="mt-2 text-sm text-red-600">{invite.error.message}</p>}
      {result && (
        <div className="mt-3 space-y-1 text-sm">
          {result.ok.length > 0 && (
            <p className="text-emerald-600">
              ✓ Invited {result.ok.join(", ")}.{" "}
              {result.emailSent || org?.emailConfigured
                ? "They'll get an email."
                : "No email service is set up, so send them the link below."}
            </p>
          )}
          {result.failed.map((f) => (
            <p key={f.email} className="text-red-600">
              ✕ {f.email}: {f.error}
            </p>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Join link:</span>
        <code className="min-w-0 flex-1 truncate">{link}</code>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Invited people sign up at that link with the same email address, then click <strong>Join</strong>.
      </p>
    </Card>
  );
}

function MembersCard({ me, canManage, isOwner }: { me: string; canManage: boolean; isOwner: boolean }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useOrgMembers(0, q || undefined);
  const changeRole = useChangeMemberRole();
  const remove = useRemoveMember();
  const [err, setErr] = useState<string | null>(null);
  const members = data?.members ?? [];

  const run = async (p: Promise<unknown>) => {
    setErr(null);
    try {
      await p;
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Card
      className="self-start"
      title={`Members${data ? ` · ${data.totalCount}` : ""}`}
      action={
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-40 pl-7 text-xs" />
        </div>
      }
    >
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <ul className="divide-y">
        {members.map((m) => {
          const self = m.email === me;
          const editable = canManage && !self && m.role !== "owner" && (isOwner || m.role === "member");
          return (
            <li key={m.email} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.name || m.email} image={m.image ?? null} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name || m.email.split("@")[0]} {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              </div>
              {editable && isOwner ? (
                <select
                  value={m.role}
                  disabled={changeRole.isPending}
                  onChange={(e) => void run(changeRole.mutateAsync({ email: m.email, role: e.target.value as "admin" | "member" }))}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  aria-label={`Role of ${m.email}`}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{ROLE_LABEL[m.role]}</span>
              )}
              {editable && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-red-600"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.email} from the workspace? Their chats and files move to you.`)) {
                      void run(remove.mutateAsync({ email: m.email, transferTo: me }));
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {!isLoading && !members.length && <p className="text-sm text-muted-foreground">No one matches.</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </Card>
  );
}

function PendingCard() {
  const { data } = useOrgInvitations();
  const list = data?.invitations ?? [];
  return (
    <Card title={`Pending invitations${list.length ? ` · ${list.length}` : ""}`} icon={<IconMail className="size-4" />}>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody is waiting to join.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <Avatar name={i.email} size={28} />
              <span className="min-w-0 flex-1 truncate">{i.email}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABEL[i.role]}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DomainCard({ current }: { current: string | null }) {
  const set = useSetOrgDomain();
  const [value, setValue] = useState(current ?? "");
  return (
    <Card title="Join by email domain" icon={<IconWorld className="size-4" />}>
      <p className="mb-2 text-xs text-muted-foreground">
        Anyone who signs up with a verified email at this domain can join without an invite.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set.mutate(value.trim() || null);
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="company.com" className="h-8 text-sm" />
        <Button size="sm" type="submit" variant="outline" disabled={set.isPending || (!value.trim() && !current)}>
          {set.isPending ? "Saving…" : value.trim() || !current ? "Save" : "Turn off"}
        </Button>
      </form>
      {set.error && <p className="mt-2 text-xs text-red-600">{set.error.message}</p>}
      {set.isSuccess && <p className="mt-2 text-xs text-emerald-600">Saved.</p>}
    </Card>
  );
}

function RolesCard() {
  return (
    <Card title="Roles">
      <dl className="space-y-2 text-xs">
        {(Object.keys(ROLE_HELP) as Array<keyof typeof ROLE_HELP>).map((r) => (
          <div key={r}>
            <dt className="font-medium">{ROLE_LABEL[r]}</dt>
            <dd className="text-muted-foreground">{ROLE_HELP[r]}</dd>
          </div>
        ))}
        <div className="pt-1 text-muted-foreground">Only people can approve workflow steps; the agent never can.</div>
      </dl>
    </Card>
  );
}
