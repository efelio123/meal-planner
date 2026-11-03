import type { Recipe } from '@/lib/api';
import type { RecipeIngredientDraft } from './recipe-form-utils';
import { loadRecipeSections, orderedSectionIngredients, removeRecipeSection, reorderSectionIngredients, sectionedIngredientInputs, sectionsMatchSaved } from './recipe-sections';

const sections = [{ key: 'a', name: 'Chicken' }, { key: 'b', name: 'Mash' }];
function row(key: string, sectionKey: string | null, amount = '1/2'): RecipeIngredientDraft {
  return { key, sectionKey, catalogItemId: 'butter', catalogItemName: 'Butter', categoryEmoji: null, amount, unitCode: 'tbsp', unitLabel: 'Tablespoon', customUnitLabel: '', note: `Note ${key}` };
}

describe('recipe section drafts', () => {
  it('keeps repeated ingredients distinct and maps section identity to the submitted order', () => {
    const rows = [row('chicken', 'a'), row('salt', null, ''), row('mash', 'b', '2 2/3')];
    const inputs = sectionedIngredientInputs(rows, [...sections].reverse());
    expect(inputs.map((r) => [r.note, r.section_position, r.amount])).toEqual([['Note salt', null, null], ['Note mash', 0, '2 2/3'], ['Note chicken', 1, '1/2']]);
    expect(inputs.every((r) => !('key' in r) && !('sectionKey' in r))).toBe(true);
    expect(rows.map((r) => r.key)).toEqual(['chicken', 'salt', 'mash']);
  });
  it('removes only grouping and appends removed occurrences after existing unassigned rows', () => {
    const rows = [row('salt', null), row('chicken', 'a'), row('mash', 'b'), row('sauce', 'a')];
    const next = orderedSectionIngredients(removeRecipeSection(rows, 'a'), [sections[1]]);
    expect(next.map((r) => [r.key, r.sectionKey])).toEqual([['salt', null], ['chicken', null], ['sauce', null], ['mash', 'b']]);
    expect(next.find((r) => r.key === 'chicken')).toEqual({ ...rows[1], sectionKey: null });
  });
  it('reorders within a section and rejects stale, duplicate or cross-section drops', () => {
    const rows = [row('salt', null), row('chicken', 'a'), row('sauce', 'a'), row('mash', 'b')];
    expect(reorderSectionIngredients(rows, 'a', ['sauce', 'chicken']).map((r) => r.key)).toEqual(['salt', 'sauce', 'chicken', 'mash']);
    for (const keys of [['chicken'], ['chicken', 'chicken'], ['chicken', 'mash'], ['deleted', 'sauce']]) expect(reorderSectionIngredients(rows, 'a', keys)).toBe(rows);
    expect(reorderSectionIngredients(rows, 'a', ['chicken', 'sauce'])).toBe(rows);
  });
  it('loads saved groups into independent local identities and preserves legacy flat inputs', () => {
    const saved = { ingredient_sections: [{ id: 'saved-a', position: 0, name: 'Chicken' }], ingredients: [{ id: 'i', catalog_item_id: 'butter', catalog_item_name: 'Butter', category_emoji: null, amount: '0.500', unit_code: 'tbsp', unit_label: 'Tablespoon', custom_unit_label: null, note: 'soft', position: 0, section_position: 0 }] } as Recipe;
    const loaded = loadRecipeSections(saved);
    expect(loaded.ingredients[0].sectionKey).toBe(loaded.sections[0].key);
    expect(loaded.sections[0].key).not.toBe('saved-a');
    expect(loaded.ingredients[0]).toMatchObject({ amount: '0.5', note: 'soft' });
    const legacy = loadRecipeSections({ ...saved, ingredient_sections: undefined, ingredients: [{ ...saved.ingredients![0], section_position: undefined }] });
    expect(legacy.sections).toEqual([]);
    expect(sectionedIngredientInputs(legacy.ingredients, []).some((i) => 'section_position' in i)).toBe(false);
  });
  it('requires grouped save confirmation to include names and assignments', () => {
    const inputs = sectionedIngredientInputs([row('chicken', 'a')], sections);
    const saved = { ingredient_sections: sections.map((s, position) => ({ id: s.key, name: s.name, position })), ingredients: inputs } as unknown as Recipe;
    expect(sectionsMatchSaved(saved, sections, inputs)).toBe(true);
    expect(sectionsMatchSaved({ ...saved, ingredients: [] }, sections, inputs)).toBe(false);
    expect(sectionsMatchSaved({ ...saved, ingredient_sections: undefined }, sections, inputs)).toBe(false);
    expect(sectionsMatchSaved({ ...saved, ingredients: [{ ...saved.ingredients![0], section_position: 1 }] }, sections, inputs)).toBe(false);
    expect(sectionsMatchSaved(saved, [...sections].reverse(), inputs)).toBe(false);
    expect(sectionsMatchSaved({} as Recipe, [])).toBe(true);
  });
});
