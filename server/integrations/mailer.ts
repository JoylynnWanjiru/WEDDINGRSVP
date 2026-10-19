// Outgoing email (PROJECT_SPEC §2, §10). Services depend on the Mailer interface;
// production uses Gmail SMTP through Nodemailer, tests use an in-memory fake.

import nodemailer from "nodemailer";
import { config } from "../config";

export type OutgoingEmail = {
  to: string;
  fromName: string;
  subject: string;
  html: string;
  text: string;
};

export interface Mailer {
  /** Resolves only once the SMTP server has accepted the message (E10). */
  send(email: OutgoingEmail): Promise<{ messageId: string }>;
}

/**
 * auth: the Gmail login failed (app password revoked, 2-Step Verification off): stop sending.
 * transient: worth retrying later (network, 4xx). permanent: retrying won't help (5xx).
 */
export type MailerErrorKind = "auth" | "transient" | "permanent";

export class MailerError extends Error {
  constructor(
    readonly kind: MailerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "MailerError";
  }
}

function classify(err: unknown): MailerError {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const message = (e.message ?? String(err)).slice(0, 500);
  if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534) return new MailerError("auth", message);
  if (typeof e.responseCode === "number" && e.responseCode >= 500) return new MailerError("permanent", message);
  return new MailerError("transient", message);
}

export function createGmailMailer(): Mailer {
  const user = config.gmailUser();
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: config.gmailAppPassword() },
  });
  return {
    async send(email) {
      try {
        const info = await transport.sendMail({
          from: { name: email.fromName, address: user },
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        return { messageId: info.messageId };
      } catch (err) {
        throw classify(err);
      }
    },
  };
}
