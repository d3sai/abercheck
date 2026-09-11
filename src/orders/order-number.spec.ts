import { normalizeOrderNumber } from './order-number';

describe('normalizeOrderNumber', () => {
  it.each([
    ['0000-066717', '0000-066717'],
    [' 0000-066717 ', '0000-066717'],
    ['№А 0000-066717', '0000-066717'],
    ['№Д0000-066717', '0000-066717'],
    ['Оплата за замовлення №Т 0000-066717 від 03.09.2026', '0000-066717'],
  ])('should extract the 1C number from %p', (raw, expected) => {
    expect(normalizeOrderNumber(raw)).toBe(expected);
  });

  it.each([
    [' 1548 ', '1548'],
    ['10000-0667171', '10000-0667171'],
  ])('should return a non-standard number %p trimmed', (raw, expected) => {
    expect(normalizeOrderNumber(raw)).toBe(expected);
  });
});
