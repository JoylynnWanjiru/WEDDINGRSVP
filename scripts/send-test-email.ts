// Usage: npm run email:test -- you@example.com
// Sends one test email through the Gmail account in .env.local, and explains common errors.

import { createGmailMailer, MailerError } from "../server/integrations/mailer";

async function main() {
  const to = process.argv[2];
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    console.error("Usage: npm run email:test -- you@example.com");
    process.exit(1);
  }
  for (const name of ["GMAIL_USER", "GMAIL_APP_PASSWORD"]) {
    if (!process.env[name]) {
      console.error(`${name} is missing from .env.local (see docs/SETUP.md, step 2).`);
      process.exit(1);
    }
  }

  try {
    const { messageId } = await createGmailMailer().send({
      to,
      fromName: "Wedding RSVP test",
      subject: "Test email from your wedding RSVP app",
      text: "If you can read this, Gmail sending works. 🎉",
      html: '<p style="font-family:Georgia,serif;color:#3D0F19">If you can read this, <strong>Gmail sending works</strong>. 🎉</p>',
    });
    console.log(`✓ Sent to ${to} from ${process.env.GMAIL_USER} (id ${messageId}). Check the inbox, and the spam folder.`);
  } catch (err) {
    const e = err as MailerError;
    console.error(`✗ Not sent: ${e.message}`);
    if (e.kind === "auth") {
      console.error(
        "  Gmail rejected the login. Check that:\n" +
          "   • GMAIL_USER is the full address, e.g. ourwedding.rsvp@gmail.com\n" +
          "   • GMAIL_APP_PASSWORD is the 16-letter app password (not your normal password)\n" +
          "   • 2-Step Verification is still on for that account",
      );
    }
    process.exit(1);
  }
}

void main();
