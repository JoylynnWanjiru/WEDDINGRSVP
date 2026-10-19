import { MailerError, type Mailer, type MailerErrorKind, type OutgoingEmail } from "@/server/integrations/mailer";

/** Records every accepted email. Queue failures with fail("transient" | "permanent" | "auth"). */
export class FakeMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  private failures: MailerErrorKind[] = [];

  fail(...kinds: MailerErrorKind[]) {
    this.failures.push(...kinds);
    return this;
  }

  async send(email: OutgoingEmail) {
    const failure = this.failures.shift();
    if (failure) throw new MailerError(failure, `fake ${failure} failure`);
    this.sent.push(email);
    return { messageId: `<${this.sent.length}@fake.test>` };
  }

  to(address: string) {
    return this.sent.filter((e) => e.to === address);
  }
}
