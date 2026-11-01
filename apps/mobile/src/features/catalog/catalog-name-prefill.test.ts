import { initialCreateName, namePrefillParams, namePrefillScope } from './catalog-name-prefill';

const scope = namePrefillScope('user', 'session', 'household');

describe('scoped create-name handoff', () => {
  it('trims only the outer whitespace and preserves punctuation, Unicode and long names for validation', () => {
    const name = 'Crème & Beans + "Family" / 🥬?  large';
    expect(initialCreateName(namePrefillParams(`  ${name}  `, scope), scope)).toBe(name);
    const longName = 'a'.repeat(200);
    expect(initialCreateName(namePrefillParams(longName, scope), scope)).toBe(longName);
  });

  it.each(['', '   ', '\n\t'])('keeps blank Create blank for %j', (query) => {
    expect(namePrefillParams(query, scope)).toEqual({});
    expect(initialCreateName(namePrefillParams(query, scope), scope)).toBe('');
  });

  it('never seeds Edit, another household/session/user or a missing authenticated scope', () => {
    const params = namePrefillParams('Market', scope);
    expect(initialCreateName(params, scope, true)).toBe('');
    for (const other of [namePrefillScope('other', 'session', 'household'), namePrefillScope('user', 'other', 'household'), namePrefillScope('user', 'session', 'other'), null]) {
      expect(initialCreateName(params, other)).toBe('');
    }
    expect(namePrefillScope(null, 'session', 'household')).toBeNull();
    expect(namePrefillScope('user', null, 'household')).toBeNull();
    expect(namePrefillScope('user', 'session', null)).toBeNull();
  });

  it.each([
    { initialName: ['wrong'], prefillScope: scope! },
    { initialName: 'wrong', prefillScope: [scope!] },
    { initialName: 'wrong' },
    { prefillScope: scope! },
    { initialName: 'wrong', prefillScope: 'malformed' },
  ])('ignores malformed or incomplete route params %j', (params) => {
    expect(initialCreateName(params, scope)).toBe('');
  });
});
