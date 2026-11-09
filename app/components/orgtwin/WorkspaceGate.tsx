import { useAcceptInvitation, useCreateOrg, useJoinByDomain, useOrg } from "@agent-native/core/client/org-team";
import { useQueryClient } from "@tanstack/react-query";
import { IconBuildingSkyscraper, IconLoader2, IconMailOpened, IconUsersGroup } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * OrgTwin data belongs to a workspace (your company). Before the app shows anything, the person is in one:
 * join the workspace an admin invited them to, join by their email domain, or create a new one.
 */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { data: org, isLoading, error } = useOrg();
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <IconLoader2 className="mr-2 size-4 animate-spin" /> Opening your workspace…
      </div>
    );
  }
  if (error || !org || org.orgId) return <>{children}</>;
  return <ChooseWorkspace />;
}

function ChooseWorkspace() {
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const accept = useAcceptInvitation();
  const join = useJoinByDomain();
  const create = useCreateOrg();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!org) return null;

  const done = async (p: Promise<unknown>) => {
    setErr(null);
    try {
      await p;
      await qc.invalidateQueries();
    } catch (e) {
      setErr((e as Error).message || "That didn't work. Try again.");
    }
  };
  const busy = accept.isPending || join.isPending || create.isPending;
  const invites = org.pendingInvitations ?? [];
  const matches = (org.domainMatches ?? []).filter((m) => !invites.some((i) => i.orgId === m.orgId));
  const canCreate = org.access?.orgCreation !== "closed";

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto px-4 py-10 sm:items-center">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <div className="text-5xl" aria-hidden>
            🏝️
          </div>
          <h1 className="text-2xl font-semibold">Welcome to OrgTwin</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <strong className="text-foreground">{org.email}</strong>. Join your company's workspace, or
            start a new one. Everyone in a workspace shares the same company map, skills and workflows.
          </p>
        </div>

        {invites.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <IconMailOpened className="size-4" /> You're invited
            </h2>
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl border bg-background p-3 shadow-sm">
                <Avatar name={i.orgName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.orgName}</div>
                  <div className="truncate text-xs text-muted-foreground">Invited by {i.invitedBy}</div>
                </div>
                <Button size="sm" disabled={busy} onClick={() => done(accept.mutateAsync(i.id))}>
                  Join
                </Button>
              </div>
            ))}
          </section>
        )}

        {matches.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <IconUsersGroup className="size-4" /> Your team is already here
            </h2>
            {matches.map((m) => (
              <div key={m.orgId} className="flex items-center gap-3 rounded-xl border bg-background p-3 shadow-sm">
                <Avatar name={m.orgName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.orgName}</div>
                  <div className="truncate text-xs text-muted-foreground">Open to everyone with your email domain</div>
                </div>
                <Button size="sm" disabled={busy} onClick={() => done(join.mutateAsync(m.orgId))}>
                  Join
                </Button>
              </div>
            ))}
          </section>
        )}

        {canCreate ? (
          <section className="space-y-3 rounded-xl border bg-background p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <IconBuildingSkyscraper className="size-4" /> Start a new company workspace
            </h2>
            <p className="text-xs text-muted-foreground">
              You'll be its owner and can invite your team from the Team page.
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) void done(create.mutateAsync(name.trim()));
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Company name, e.g. Northwind Robotics"
                aria-label="Company name"
                maxLength={80}
              />
              <Button type="submit" disabled={busy || !name.trim()}>
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </form>
          </section>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            New workspaces are turned off here. Ask your admin to invite <strong>{org.email}</strong>.
          </p>
        )}

        {invites.length === 0 && matches.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Joining a teammate? Ask an admin to invite <strong>{org.email}</strong> from their Team page, then reload
            this page.
          </p>
        )}
        {err && <p className="text-center text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}

export function Avatar({ name, image, size = 36 }: { name: string; image?: string | null; size?: number }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  if (image) return <img src={image} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 45%)` }}
    >
      {initials || "?"}
    </span>
  );
}
