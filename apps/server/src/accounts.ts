import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { User } from '@houston/protocol';
import type { Database } from './db';
import type { Mailer } from './mailer';
import { type Language, messages } from './messages';

const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
/** A new code is only sent once the previous one is this old. */
const CODE_RESEND_MS = 60_000;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  language: Language;
}

export interface AccountUser extends User {
  language: Language;
}

function toUser(row: UserRow): AccountUser {
  return { id: row.id, email: row.email, displayName: row.display_name, language: row.language };
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Passwordless accounts: an emailed six-digit code signs in, and creates the account on
 * first use. Codes are stored as HMACs with a server secret, tokens as SHA-256 hashes.
 */
export class Accounts {
  constructor(
    private readonly db: Database,
    private readonly mailer: Mailer | null,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  get available() {
    return this.mailer !== null;
  }

  async requestCode(email: string, language: Language): Promise<void> {
    if (!this.mailer) throw new Error('No mailer configured');
    const now = this.now();
    const existing = this.db
      .prepare('SELECT created_at FROM login_codes WHERE email = ? AND expires_at > ?')
      .get(email, now) as { created_at: number } | undefined;
    if (existing && now - existing.created_at < CODE_RESEND_MS) return;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.db
      .prepare(
        `INSERT INTO login_codes (email, code_hash, attempts, created_at, expires_at)
         VALUES (?, ?, 0, ?, ?)
         ON CONFLICT (email) DO UPDATE SET
           code_hash = excluded.code_hash, attempts = 0,
           created_at = excluded.created_at, expires_at = excluded.expires_at`,
      )
      .run(email, this.codeHash(email, code), now, now + CODE_TTL_MS);

    const text = messages(language);
    await this.mailer.send({
      to: email,
      subject: text.codeSubject(code),
      text: text.codeText(code),
    });
  }

  /** Returns a new auth token, or null if the code is wrong, expired or used up. */
  verifyCode(
    email: string,
    code: string,
    language: Language,
  ): { token: string; user: AccountUser } | null {
    const now = this.now();
    const row = this.db
      .prepare('SELECT code_hash, attempts, expires_at FROM login_codes WHERE email = ?')
      .get(email) as { code_hash: string; attempts: number; expires_at: number } | undefined;
    if (!row || row.expires_at < now || row.attempts >= CODE_MAX_ATTEMPTS) return null;

    const expected = Buffer.from(row.code_hash, 'hex');
    const actual = Buffer.from(this.codeHash(email, code), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      this.db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
      return null;
    }
    this.db.prepare('DELETE FROM login_codes WHERE email = ?').run(email);

    let user = this.findByEmail(email);
    if (!user) {
      const id = randomBytes(12).toString('base64url');
      this.db
        .prepare(
          'INSERT INTO users (id, email, display_name, language, created_at) VALUES (?, ?, NULL, ?, ?)',
        )
        .run(id, email, language, now);
      user = this.findByEmail(email)!;
    }

    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare(
        'INSERT INTO auth_tokens (token_hash, user_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(sha256(token), user.id, now, now, now + TOKEN_TTL_MS);
    return { token, user };
  }

  /** Resolves an auth token; using it extends its lifetime. */
  authenticate(token: string): AccountUser | null {
    const now = this.now();
    const hash = sha256(token);
    const row = this.db
      .prepare(
        `SELECT users.id, users.email, users.display_name, users.language
         FROM auth_tokens JOIN users ON users.id = auth_tokens.user_id
         WHERE auth_tokens.token_hash = ? AND auth_tokens.expires_at > ?`,
      )
      .get(hash, now) as UserRow | undefined;
    if (!row) return null;
    this.db
      .prepare('UPDATE auth_tokens SET last_used_at = ?, expires_at = ? WHERE token_hash = ?')
      .run(now, now + TOKEN_TTL_MS, hash);
    return toUser(row);
  }

  signOut(token: string) {
    this.db.prepare('DELETE FROM auth_tokens WHERE token_hash = ?').run(sha256(token));
  }

  update(userId: string, changes: { displayName?: string | null; language?: Language }) {
    if (changes.displayName !== undefined) {
      this.db
        .prepare('UPDATE users SET display_name = ? WHERE id = ?')
        .run(changes.displayName || null, userId);
    }
    if (changes.language) {
      this.db.prepare('UPDATE users SET language = ? WHERE id = ?').run(changes.language, userId);
    }
  }

  findByEmail(email: string): AccountUser | null {
    const row = this.db
      .prepare('SELECT id, email, display_name, language FROM users WHERE email = ?')
      .get(email) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  findById(id: string): AccountUser | null {
    const row = this.db
      .prepare('SELECT id, email, display_name, language FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  prune() {
    const now = this.now();
    this.db.prepare('DELETE FROM login_codes WHERE expires_at < ?').run(now);
    this.db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(now);
  }

  private codeHash(email: string, code: string) {
    return createHmac('sha256', this.secret).update(`${email}:${code}`).digest('hex');
  }
}
