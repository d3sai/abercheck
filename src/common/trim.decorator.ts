import { Transform } from 'class-transformer';

/** Обрізає пробіли на краях рядкових значень перед валідацією. */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
