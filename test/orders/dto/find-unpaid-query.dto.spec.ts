import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FindUnpaidQueryDto } from '../../../src/orders/dto/find-unpaid-query.dto';

const validate = (plain: Record<string, unknown>) =>
  validateSync(plainToInstance(FindUnpaidQueryDto, plain)).map((error) => error.property);

describe('FindUnpaidQueryDto', () => {
  it('should default to a limit of 200 with no cursor', () => {
    const dto = plainToInstance(FindUnpaidQueryDto, {});

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.limit).toBe(200);
    expect(dto.cursor).toBeUndefined();
  });

  it('should accept an explicit limit and cursor', () => {
    const dto = plainToInstance(FindUnpaidQueryDto, { limit: '50', cursor: '123' });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.limit).toBe(50);
    expect(dto.cursor).toBe(123);
  });

  it.each(['0', '501', 'abc'])('should reject limit %p', (limit) => {
    expect(validate({ limit })).toEqual(['limit']);
  });

  it.each(['0', 'abc'])('should reject cursor %p', (cursor) => {
    expect(validate({ cursor })).toEqual(['cursor']);
  });
});
