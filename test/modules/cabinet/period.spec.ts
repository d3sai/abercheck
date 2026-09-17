import { periodRange } from '../../../src/modules/cabinet/period';
import { ApiError } from '../../../src/common/api-error';

describe('periodRange', () => {
  it('should cover whole Kyiv days from the first to the last date', () => {
    const { start, end } = periodRange('2026-09-01', '2026-09-30');

    expect(start.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('should accept a single day', () => {
    const { start, end } = periodRange('2026-09-11', '2026-09-11');

    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it.each([
    ['ends before it starts', '2026-09-11', '2026-09-10'],
    ['is longer than 366 days', '2025-01-01', '2026-09-11'],
  ])('should reject a period that %s', (_case, from, to) => {
    expect(() => periodRange(from, to)).toThrow(ApiError);
  });
});
