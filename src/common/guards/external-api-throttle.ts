import type { ThrottlerOptions } from '@nestjs/throttler';

export const EXTERNAL_API_THROTTLERS: ThrottlerOptions[] = [
  { name: 'external-api', ttl: 60_000, limit: 120 },
];
