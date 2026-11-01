import { normalizeShoppingAmount, shoppingAmountError } from './shopping-amount';

describe('Shopping amount entry', () => {
  it('accepts the optional blank value and API-supported positive numbers and fractions', () => {
    for (const value of ['', '1', '2.5', '.5', ' .25 ', '.000001', '1/2', '2 2/3', '0 1/2']) {
      expect(shoppingAmountError(value)).toBeNull();
    }
  });

  it('rejects invalid or non-positive values before submitting', () => {
    for (const value of ['0', '.0', '.000', '.', '.5.2', '-.5', '1e3', '-1', '1/0', '1 0/2', '2/3/4', '2-3', 'two']) {
      expect(shoppingAmountError(value)).not.toBeNull();
    }
  });
});


it.each([['.5', '0.5'], [' .25 ', '0.25'], ['.0050', '0.0050'], ['', ''], ['2 2/3', '2 2/3'], ['1/2', '1/2'], ['2.5', '2.5'], ['.', '.'], ['.5.2', '.5.2']])('normalizes %s without rounding or changing other amount forms', (input, expected) => {
  expect(normalizeShoppingAmount(input)).toBe(expected);
});
