import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTransport } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Sends through the operator's SMTP server, e.g. smtps://user:password@mail.example.com:465 */
export function smtpMailer(url: string, from: string): Mailer {
  const transport = createTransport(url);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/** Development and tests: every mail becomes a JSON file in a directory. */
export function directoryMailer(dir: string): Mailer {
  mkdirSync(dir, { recursive: true });
  let counter = 0;
  return {
    async send(mail) {
      const file = `${Date.now()}-${counter++}.json`;
      writeFileSync(join(dir, file), JSON.stringify(mail, null, 2));
    },
  };
}
