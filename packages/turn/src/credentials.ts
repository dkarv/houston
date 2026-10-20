import { createHmac } from 'node:crypto';

export interface TurnCredentials {
  username: string;
  credential: string;
}

/**
 * Time-limited TURN credentials ("TURN REST API" scheme, as used by coturn):
 * username = "<expiry unix seconds>:<user id>", password = base64(HMAC-SHA1(secret, username)).
 * The TURN server verifies them with the same secret, so no state is shared.
 */
export function createTurnCredentials(
  secret: string,
  userId: string,
  ttlSeconds: number,
  now = Date.now(),
): TurnCredentials {
  const expiry = Math.floor(now / 1000) + ttlSeconds;
  const username = `${expiry}:${userId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}
