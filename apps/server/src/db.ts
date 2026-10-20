import { DatabaseSync } from 'node:sqlite';

/**
 * Schema changes, applied in order and tracked with SQLite's user_version.
 * Plain portable SQL, so moving to Postgres later is a straightforward port.
 */
const migrations: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    -- For emails and notifications: 'de' or 'en'.
    language TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE login_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX auth_tokens_user ON auth_tokens (user_id);

  CREATE TABLE rings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    caller_name TEXT,
    caller_device_hash TEXT NOT NULL,
    caller_ip_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX rings_user ON rings (user_id, created_at);

  CREATE TABLE blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_hash TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX blocks_user ON blocks (user_id);

  CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    -- Web Push endpoint URL, or the APNs/FCM device token.
    address TEXT NOT NULL UNIQUE,
    keys TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);
  `,
];

export type Database = DatabaseSync;

export function openDatabase(file: string): Database {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  for (let i = version; i < migrations.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}
