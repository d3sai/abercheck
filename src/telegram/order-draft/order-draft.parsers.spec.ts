import {
  parseExchangeRate,
  parseMoney,
  parseOrderNumber,
  parsePhone,
  parseText,
} from './order-draft.parsers';

const value = (result: ReturnType<typeof parseMoney>) => (result.ok ? result.value : null);

describe('order draft parsers', () => {
  it.each([
    ['0000-066717', '0000-066717'],
    ['№А 0000-066717', '0000-066717'],
    ['1548', null],
    ['0000-06671', null],
  ])('parseOrderNumber(%p) → %p', (input, expected) => {
    expect(value(parseOrderNumber(input))).toBe(expected);
  });

  it.each([
    ['6 158,41 грн', '6158.41'],
    ['6158.41', '6158.41'],
    ['17675', '17675'],
    ['1 197,2', '1197.2'],
    ['4\u00a0594.45 грн.', '4594.45'],
    ['17 933,31 ГРН', '17933.31'],
    ['6.158,41', null],
    ['0', null],
    ['-100', null],
    ['12,345', null],
    ['сто', null],
  ])('parseMoney(%p) → %p', (input, expected) => {
    expect(value(parseMoney(input))).toBe(expected);
  });

  it.each([
    ['44,9', '44.9'],
    ['44,9%', '44.9'],
    ['44.95 %', '44.95'],
    ['0', null],
    ['44,12345', null],
  ])('parseExchangeRate(%p) → %p', (input, expected) => {
    expect(value(parseExchangeRate(input))).toBe(expected);
  });

  it.each([
    ['+380 67 123 45 67', '+380 67 123 45 67'],
    ['(067) 123-45-67', '(067) 123-45-67'],
    ['дзвонити ввечері', null],
    ['123', null],
  ])('parsePhone(%p) → %p', (input, expected) => {
    expect(value(parsePhone(input))).toBe(expected);
  });

  it('should trim text and enforce the length limit', () => {
    const parse = parseText(5);

    expect(value(parse('  abc  '))).toBe('abc');
    expect(value(parse('   '))).toBeNull();
    expect(value(parse('abcdef'))).toBeNull();
  });
});
