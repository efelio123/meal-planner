import { newRecipeDraft, type RecipeIngredientDraft } from './recipe-form-utils';
import { recipeDraftFingerprint } from './recipe-draft-fingerprint';

const sections = [{ key: 'section-a', name: 'Chicken' }, { key: 'section-b', name: 'Mash' }];
const row: RecipeIngredientDraft = { key: 'one', catalogItemId: 'butter', catalogItemName: 'Butter', categoryEmoji: null, amount: '1/2', unitCode: 'tbsp', unitLabel: 'Tablespoon', customUnitLabel: '', note: 'soft', sectionKey: 'section-a' };
const steps = [{ key: 'step', instruction: 'Cook the chicken' }];
const draft = { ...newRecipeDraft(), name: 'Dinner' };
const baseline = recipeDraftFingerprint(draft, [row], sections, steps);

it('ignores regenerated local identities and refreshed display labels', () => {
  expect(recipeDraftFingerprint(draft, [{ ...row, key: 'new', catalogItemName: 'Butter renamed', unitLabel: 'Tablespoons', sectionKey: 'new-a' }], [{ ...sections[0], key: 'new-a' }, sections[1]], [{ ...steps[0], key: 'new-step' }])).toBe(baseline);
});
it('does not count clearing a focused zero time field as a change', () => {
  expect(recipeDraftFingerprint({ ...draft, prepHours: '', cookMinutes: '' }, [row], sections, steps)).toBe(baseline);
});
it.each(['name', 'coverEmoji', 'servings', 'prepHours', 'cookMinutes', 'notes', 'sourceUrl'] as const)('detects a changed %s field and clears when it is reverted', (field) => {
  expect(recipeDraftFingerprint({ ...draft, [field]: '1' }, [row], sections, steps)).not.toBe(baseline);
  expect(recipeDraftFingerprint({ ...draft, [field]: draft[field] }, [row], sections, steps)).toBe(baseline);
});
it('detects ingredient quantity/unit/note/assignment, section and direction changes', () => {
  for (const change of [{ amount: '' }, { unitCode: 'cup' }, { customUnitLabel: 'scoops' }, { note: 'cold' }, { sectionKey: 'section-b' }]) expect(recipeDraftFingerprint(draft, [{ ...row, ...change }], sections, steps)).not.toBe(baseline);
  expect(recipeDraftFingerprint(draft, [row], [...sections].reverse(), steps)).not.toBe(baseline);
  expect(recipeDraftFingerprint(draft, [row], [{ ...sections[0], name: 'Sauce' }, sections[1]], steps)).not.toBe(baseline);
  expect(recipeDraftFingerprint(draft, [row], sections, [{ ...steps[0], instruction: 'Bake' }])).not.toBe(baseline);
  const second = { ...row, key: 'two', amount: '2' };
  expect(recipeDraftFingerprint(draft, [row, second], sections, steps)).not.toBe(recipeDraftFingerprint(draft, [second, row], sections, steps));
  expect(recipeDraftFingerprint(draft, [row], sections, [...steps, { key: 'second', instruction: 'Serve' }])).not.toBe(baseline);
});
