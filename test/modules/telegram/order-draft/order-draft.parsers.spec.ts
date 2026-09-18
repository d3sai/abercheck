import {
  parseExchangeRate,
  parseMoney,
  parseOrderNumber,
  parseTemplate,
  parseText,
} from '../../../../src/modules/telegram/order-draft/order-draft.parsers';

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

  it('should trim text and enforce the length limit', () => {
    const parse = parseText(5);

    expect(value(parse('  abc  '))).toBe('abc');
    expect(value(parse('   '))).toBeNull();
    expect(value(parse('abcdef'))).toBeNull();
  });

  describe('parseTemplate', () => {
    const fields = [
      { field: 'orderNumber', label: 'Номер' },
      { field: 'clientName', label: 'ФОП' },
      { field: 'comment', label: 'Коментар' },
    ];

    it('should map each labelled line to its field', () => {
      const text = ['Номер: 0000-066717', 'ФОП: Чернявський Владислав', 'Коментар: '].join('\n');

      expect(parseTemplate(text, fields)).toEqual({
        orderNumber: '0000-066717',
        clientName: 'Чернявський Владислав',
        comment: '',
      });
    });

    it('should capture a multi-line value up to the next label', () => {
      const text = ['Номер: 0000-066717', 'Коментар: рядок один', 'рядок два', 'ФОП: Іванов'].join(
        '\n',
      );

      expect(parseTemplate(text, fields)).toEqual({
        orderNumber: '0000-066717',
        comment: 'рядок один\nрядок два',
        clientName: 'Іванов',
      });
    });

    it('should ignore text before the first label and be case-insensitive', () => {
      const text = ['щось стороннє', 'номер: 0000-066717'].join('\n');

      expect(parseTemplate(text, fields)).toEqual({ orderNumber: '0000-066717' });
    });

    it('should return an empty map when no label matches', () => {
      expect(parseTemplate('просто текст', fields)).toEqual({});
    });
  });
});
