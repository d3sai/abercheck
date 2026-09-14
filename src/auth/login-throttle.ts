import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Logins reach the backend through the frontend server, which passes the visitor's address in this
 * header. A direct caller can forge it, so the per-account limit is the hard cap on guessing.
 */
export const CLIENT_IP_HEADER = 'x-client-ip';

interface LoginRequest {
  body?: { login?: unknown };
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

function loginOf(req: Record<string, unknown>): string {
  const { login } = (req as unknown as LoginRequest).body ?? {};
  return typeof login === 'string' ? login.trim().toLowerCase() : '';
}

function ipOf(req: Record<string, unknown>): string {
  const { headers, ip } = req as unknown as LoginRequest;
  const header = headers[CLIENT_IP_HEADER];
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  if (value) {
    return value;
  }
  return ip ?? 'unknown';
}

export const LOGIN_THROTTLERS: ThrottlerOptions[] = [
  // One visitor guessing one account.
  { name: 'login-ip', ttl: 60_000, limit: 5, getTracker: (req) => `${loginOf(req)}|${ipOf(req)}` },
  // One visitor trying many accounts.
  { name: 'ip', ttl: 60_000, limit: 20, getTracker: (req) => ipOf(req) },
  // Many visitors guessing one account. Its owner can still sign in through Telegram meanwhile.
  { name: 'login', ttl: 15 * 60_000, limit: 30, getTracker: (req) => loginOf(req) },
];
