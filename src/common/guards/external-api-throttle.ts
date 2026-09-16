import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * POST /payments and GET /orders/unpaid are called only by the payment-source service, authenticated
 * by a shared API key and allowlisted by IP at the infrastructure level. This isn't attack protection —
 * it's a backstop against a stuck retry loop or a misconfigured poller hammering the database.
 */
export const EXTERNAL_API_THROTTLERS: ThrottlerOptions[] = [
  { name: 'external-api', ttl: 60_000, limit: 120 },
];
