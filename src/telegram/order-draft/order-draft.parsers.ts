import { MONEY_PATTERN } from '../../common/money';
import { EXCHANGE_RATE_PATTERN } from '../../orders/dto/create-order.dto';
import { normalizeOrderNumber } from '../../orders/order-number';

export type ParseResult = { ok: true; value: string } | { ok: false; error: string };

const ok = (value: string): ParseResult => ({ ok: true, value });
const fail = (error: string): ParseResult => ({ ok: false, error });

/** Номер 1С; літеру-префікс ("№А 0000-066717") відкидаємо. */
export function parseOrderNumber(input: string): ParseResult {
  const value = normalizeOrderNumber(input);
  return /^\d{4}-\d{6}$/.test(value) ? ok(value) : fail('Номер має бути у форматі 0000-066717.');
}

/**
 * Число так, як його пишуть менеджери: "6 158,41 грн", "17675", "1 197.2".
 * Крапка й кома водночас ("6.158,41") — неоднозначно, таке відхиляємо.
 */
function parseDecimal(input: string, suffix: RegExp): string | null {
  const compact = input.replace(suffix, '').replace(/[\s\u00a0\u202f]/g, '');
  if (compact.includes(',') && compact.includes('.')) {
    return null;
  }
  return compact.replace(',', '.');
}

export function parseMoney(input: string): ParseResult {
  const value = parseDecimal(input, /грн\.?/gi);
  return value !== null && MONEY_PATTERN.test(value)
    ? ok(value)
    : fail('Вкажіть суму числом, до копійок: 6 158,41');
}

export function parseExchangeRate(input: string): ParseResult {
  const value = parseDecimal(input, /%/g);
  return value !== null && EXCHANGE_RATE_PATTERN.test(value)
    ? ok(value)
    : fail('Вкажіть курс числом: 44,9');
}

export function parsePhone(input: string): ParseResult {
  const value = input.trim();
  return /^\+?[\d\s()-]{7,20}$/.test(value)
    ? ok(value)
    : fail('Вкажіть телефон цифрами: +380 67 123 45 67');
}

export function parseText(maxLength: number): (input: string) => ParseResult {
  return (input) => {
    const value = input.trim();
    if (value.length === 0) {
      return fail('Значення не може бути порожнім.');
    }
    return value.length <= maxLength ? ok(value) : fail(`Не більше ${maxLength} символів.`);
  };
}
