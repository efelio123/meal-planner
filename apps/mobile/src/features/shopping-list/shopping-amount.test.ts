import { shoppingAmountError } from './shopping-amount';

describe('Shopping amount entry', () => {
  it('accepts the optional blank value and API-supported positive numbers and fractions', () => {
    for (const value of ['', '1', '2.5', '1/2', '2 2/3', '0 1/2']) {
      expect(shoppingAmountError(value)).toBeNull();
    }
  });

  it('rejects invalid or non-positive values before submitting', () => {
    for (const value of ['0', '-1', '1/0', '1 0/2', '2/3/4', '2-3', 'two']) {
      expect(shoppingAmountError(value)).not.toBeNull();
    }
  });
});
