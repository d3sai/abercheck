import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateOrderDto } from '../../../src/orders/dto/update-order.dto';

const validate = (plain: Record<string, unknown>) =>
  validateSync(plainToInstance(UpdateOrderDto, plain)).map((error) => error.property);

describe('UpdateOrderDto', () => {
  it('should accept an empty patch', () => {
    expect(validate({})).toEqual([]);
  });

  it.each(['100', '100.5', '100.55', '0.01', '999999999999.99'])(
    'should accept amount %s',
    (amountDue) => {
      expect(validate({ amountDue })).toEqual([]);
    },
  );

  it.each(['0', '0.00', '-5', '100.555', '1,5', 'abc', '1000000000000'])(
    'should reject amount %p',
    (amountDue) => {
      expect(validate({ amountDue })).toEqual(['amountDue']);
    },
  );
});
