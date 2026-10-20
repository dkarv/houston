import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Houston servers the person agreed to connect to. Only pages from these origins get the
 * desktop bridge (and with it, after consent, control of the computer).
 */
export class TrustedServers {
  private origins: Set<string>;
  private last: string | null;

  constructor(private readonly file: string) {
    const data = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as { origins?: string[]; last?: string })
      : {};
    this.origins = new Set(data.origins ?? []);
    this.last = data.last ?? null;
  }

  has(origin: string) {
    return this.origins.has(origin);
  }

  /** Trusts a server and remembers it as the one to open next time. */
  add(origin: string) {
    this.origins.add(origin);
    this.last = origin;
    this.save();
  }

  /** Trusts a server for this run only, e.g. the one built into the app. */
  allow(origin: string) {
    this.origins.add(origin);
  }

  /** The server used most recently, for starting the app without a link. */
  get lastOrigin() {
    return this.last;
  }

  private save() {
    writeFileSync(this.file, JSON.stringify({ origins: [...this.origins], last: this.last }));
  }
}

function isLocal(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Only https, or plain http for a server on this machine (development). */
export function allowedServerUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === 'https:' || (url.protocol === 'http:' && isLocal(url.hostname))) return url;
  return null;
}

/** houston://open?url=<page> → the page to load, if acceptable. */
export function parseDeepLink(raw: string): URL | null {
  let link: URL;
  try {
    link = new URL(raw);
  } catch {
    return null;
  }
  if (link.protocol !== 'houston:') return null;
  // houston://open?url=… parses with "open" as host on most platforms, as path on others.
  const action = (link.host || link.pathname.replace(/^\/+/, '')).replace(/\/$/, '');
  if (action !== 'open') return null;
  const target = link.searchParams.get('url');
  return target ? allowedServerUrl(target) : null;
}
