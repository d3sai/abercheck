import type { ExecutionContext } from '@nestjs/common';
import { LOGIN_THROTTLERS } from '../../../src/modules/auth/login-throttle';

const context = {} as ExecutionContext;

function trackerOf(name: string) {
  const getTracker = LOGIN_THROTTLERS.find((throttler) => throttler.name === name)?.getTracker;
  if (!getTracker) {
    throw new Error(`No tracker for ${name}`);
  }
  return (req: Record<string, unknown>) => Promise.resolve(getTracker(req, context));
}

describe('login throttlers', () => {
  const request = {
    body: { login: ' Olena ' },
    headers: { 'x-client-ip': '203.0.113.5' },
    ip: '10.0.0.1',
  };

  it('should count guesses per account and visitor', async () => {
    await expect(trackerOf('login-ip')(request)).resolves.toBe('olena|203.0.113.5');
  });

  it('should count attempts per visitor across accounts', async () => {
    await expect(trackerOf('ip')(request)).resolves.toBe('203.0.113.5');
  });

  it('should fall back to the socket address without the client IP header', async () => {
    await expect(trackerOf('ip')({ ...request, headers: {} })).resolves.toBe('10.0.0.1');
  });

  it('should cap guesses on one account whatever address they come from', async () => {
    await expect(trackerOf('login')({ ...request, body: { login: 'OLENA' } })).resolves.toBe(
      'olena',
    );
    expect(LOGIN_THROTTLERS.find((throttler) => throttler.name === 'login')).toMatchObject({
      ttl: 15 * 60_000,
      limit: 30,
    });
  });
});
