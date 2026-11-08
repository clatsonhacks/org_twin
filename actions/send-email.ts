import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import nodemailer from "nodemailer";

import { requireGrant, requireSecret, secret } from "../server/connectors/registry.js";
import { owner } from "./lib/owner.js";

export default defineAction({
  description:
    "Send an email through the connected SMTP account. Write the full body yourself. If EMAIL_REDIRECT_TO is set, every email goes to that inbox instead (demo safety) and the result says so. The user approves before it is sent.",
  schema: z.object({
    to: z.array(z.string().email()).min(1).max(20),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(20000).describe("Plain text body"),
    skillId: z.string().optional().describe("Skill this call runs for; it must be granted this tool"),
  }),
  needsApproval: true,
  run: async ({ to, subject, body, skillId }, ctx) => {
    await requireGrant(owner(ctx), skillId, "email");
    const host = await requireSecret("SMTP_HOST", "Email");
    const user = await requireSecret("SMTP_USER", "Email");
    const pass = await requireSecret("SMTP_PASSWORD", "Email");
    const port = Number((await secret("SMTP_PORT")) || 587);
    const from = (await secret("SMTP_FROM")) || user;
    const redirect = await secret("EMAIL_REDIRECT_TO");
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    const recipients = redirect ? [redirect] : to;
    const text = redirect ? `[OrgTwin demo: originally to ${to.join(", ")}]\n\n${body}` : body;
    const info = await transport.sendMail({ from, to: recipients, subject, text });
    return { sent: true, messageId: info.messageId, deliveredTo: recipients, redirected: Boolean(redirect) };
  },
});
