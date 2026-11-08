import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireGrant, requireSecret } from "../server/connectors/registry.js";
import { owner } from "./lib/owner.js";

async function stripe(key: string, path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(`Stripe: ${json?.error?.message ?? res.status}`);
  return json;
}

export default defineAction({
  description:
    "Create a Stripe invoice in TEST mode for a customer (found or created by email), with line items. send=false leaves it as a draft; send=true finalizes and emails it. Only sk_test_ keys are accepted. The user approves first.",
  schema: z.object({
    customerEmail: z.string().email(),
    customerName: z.string().default(""),
    currency: z.string().length(3).default("usd"),
    items: z
      .array(z.object({ description: z.string().min(1), amount: z.number().positive().describe("Total for this line in major units, e.g. 2400.00") }))
      .min(1)
      .max(20),
    daysUntilDue: z.number().int().min(1).max(120).default(30),
    send: z.boolean().default(false),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async (args, ctx) => {
    await requireGrant(owner(ctx), args.skillId, "stripe");
    const key = await requireSecret("STRIPE_SECRET_KEY", "Stripe");
    if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
      throw new Error("Only Stripe TEST keys are allowed in OrgTwin.");
    }
    const found = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(args.customerEmail)}&limit=1`, {
      headers: { Authorization: `Bearer ${key}` },
    }).then((r) => r.json() as any);
    const customer =
      found?.data?.[0] ?? (await stripe(key, "customers", { email: args.customerEmail, ...(args.customerName ? { name: args.customerName } : {}) }));
    const invoice = await stripe(key, "invoices", {
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: String(args.daysUntilDue),
      currency: args.currency.toLowerCase(),
      pending_invoice_items_behavior: "exclude",
    });
    for (const item of args.items) {
      await stripe(key, "invoiceitems", {
        customer: customer.id,
        invoice: invoice.id,
        description: item.description,
        amount: String(Math.round(item.amount * 100)),
        currency: args.currency.toLowerCase(),
      });
    }
    let final = invoice;
    if (args.send) {
      final = await stripe(key, `invoices/${invoice.id}/finalize`, {});
      final = await stripe(key, `invoices/${invoice.id}/send`, {});
    }
    return {
      invoiceId: final.id,
      status: args.send ? "sent" : "draft",
      total: args.items.reduce((a, i) => a + i.amount, 0),
      currency: args.currency,
      hostedUrl: final.hosted_invoice_url ?? null,
      dashboardUrl: `https://dashboard.stripe.com/test/invoices/${final.id}`,
    };
  },
});
