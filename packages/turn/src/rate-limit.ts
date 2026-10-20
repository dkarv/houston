/**
 * Spoofed source addresses make per-IP limits useless, so limits are keyed on the
 * network prefix a single customer typically gets: /24 for IPv4, /56 for IPv6.
 */
export function sourcePrefix(ip: string): string {
  const v4 = ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
  if (!v4.includes(':')) return v4.split('.').slice(0, 3).join('.');
  const [head = '', tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  const fourth = (groups[3] ?? '0').padStart(4, '0').slice(0, 2);
  return `${groups.slice(0, 3).join(':')}:${fourth}`;
}

/**
 * Token bucket per source prefix; synchronous so it can run on the packet path.
 * Plain erasable TypeScript: the TURN worker runs under Node's built-in type stripping.
 */
export class PrefixRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();
  private readonly perSecond: number;
  private readonly burst: number;

  constructor(perSecond: number, burst = perSecond * 2) {
    this.perSecond = perSecond;
    this.burst = burst;
  }

  take(ip: string, now = Date.now()): boolean {
    const key = sourcePrefix(ip);
    const bucket = this.buckets.get(key) ?? { tokens: this.burst, updated: now };
    bucket.tokens = Math.min(
      this.burst,
      bucket.tokens + ((now - bucket.updated) / 1000) * this.perSecond,
    );
    bucket.updated = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  prune(maxIdleMs = 60_000, now = Date.now()) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updated > maxIdleMs) this.buckets.delete(key);
    }
  }
}
