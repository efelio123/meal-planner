import type { Recipe } from '@/lib/api';
import { newRecipeDraft, type RecipeIngredientDraft } from './recipe-form-utils';
import { buildRecipeImport, importedSectionName, type RecipeImportDraft, type RecipeImportSelection } from './recipe-import';

const ingredient = { id: 'old-occurrence', catalog_item_id: 'food', catalog_item_name: 'Butter', category_emoji: null, amount: '2 2/3', unit_code: 'tbsp', unit_label: 'Tablespoon', custom_unit_label: null, note: 'softened', position: 0 };
const source: Recipe = { id: 'source', household_id: 'home', name: 'Chicken and mash', cover_kind: 'initials', cover_emoji: null, servings: 4, prep_minutes: 10, cook_minutes: 20, notes: 'Source notes', source_url: 'https://example.test/recipe', edit_revision: 1, archived_at: null, created_at: '', updated_at: '', ingredient_count: 3,
  ingredient_sections: [{ id: 's1', name: 'Chicken', position: 0 }, { id: 's2', name: 'Mash', position: 1 }, { id: 's3', name: 'Empty', position: 2 }],
  ingredients: [{ ...ingredient, section_position: 0 }, { ...ingredient, id: 'second', section_position: 1, amount: null, unit_code: null, custom_unit_label: 'pinch', note: 'to taste', position: 1 }, { ...ingredient, id: 'other', section_position: null, position: 2 }],
  steps: [{ id: 'step', instruction: 'Cook chicken.', position: 0 }, { id: 'step2', instruction: 'Make mash.', position: 1 }],
};
const oldRow: RecipeIngredientDraft = { key: 'existing', sectionKey: 'dest', catalogItemId: 'food', catalogItemName: 'Butter', categoryEmoji: null, amount: '1', unitCode: '', unitLabel: '', customUnitLabel: '', note: 'keep' };
function current(): RecipeImportDraft { return { draft: { ...newRecipeDraft(), name: 'Our dinner', notes: 'Keep my notes', servings: '2', sourceUrl: 'https://example.test/ours' }, sections: [{ key: 'dest', name: 'Chicken' }], ingredients: [oldRow], steps: [{ key: 'ours', instruction: 'Our first step.' }] }; }
const options = { householdId: 'home', sectionKey: null, activeFoodIds: new Set(['food']) };

describe('independent recipe imports', () => {
  it('appends all groups, duplicate Food occurrences and directions without replacing metadata or mutating the source', () => {
    const before = JSON.stringify(source); const destination = current(); const saved = JSON.stringify(destination);
    const next = buildRecipeImport(destination, source, { kind: 'whole' }, options);
    expect(next.sections.map((s) => s.name)).toEqual(['Chicken', 'Chicken', 'Mash', 'Empty']);
    expect(next.ingredients.map((r) => r.note)).toEqual(['softened', 'keep', 'softened', 'to taste']); // canonical Other first
    expect(next.ingredients.find((r) => r.note === 'to taste')).toMatchObject({ amount: '', customUnitLabel: 'pinch', unitCode: '' });
    expect(next.ingredients.filter((r) => r.key !== 'existing').map((r) => r.amount)).toEqual(['2 2/3', '2 2/3', '']);
    expect(new Set(next.ingredients.map((r) => r.key)).size).toBe(4);
    expect(next.steps.map((s) => s.instruction)).toEqual(['Our first step.', 'Cook chicken.', 'Make mash.']);
    expect(next.steps[1].key).not.toBe('step');
    expect(next.draft).toEqual({ ...destination.draft, notes: 'Keep my notes\n\nFrom Chicken and mash: https://example.test/recipe' });
    next.steps[1].instruction = 'Independent'; next.ingredients[2].note = 'Changed';
    expect(JSON.stringify(source)).toBe(before); expect(JSON.stringify(destination)).toBe(saved);
  });
  it.each([0, 1, null])('imports only selected section %s, preserving directions and Notes', (position) => {
    const dest = current(); const next = buildRecipeImport(dest, source, { kind: 'section', position }, options);
    expect(next.ingredientCount).toBe(1); expect(next.directionCount).toBe(0);
    expect(next.steps).toEqual(dest.steps); expect(next.draft).toBe(dest.draft);
    expect(next.sections.length).toBe(position === null ? 1 : 2);
  });
  it('flattens a whole source into the chosen destination while keeping its visible order', () => {
    const next = buildRecipeImport(current(), source, { kind: 'whole' }, { ...options, sectionKey: 'dest' });
    expect(next.sections).toEqual(current().sections);
    expect(next.ingredients.map((r) => r.note)).toEqual(['keep', 'softened', 'to taste', 'softened']);
    expect(next.ingredients.every((r) => r.sectionKey === 'dest')).toBe(true);
    expect(next.directionCount).toBe(2);
  });
  it('makes a new section for a flat source, allows deliberate duplicate imports, deduplicates attribution', () => {
    const flat = { ...source, ingredient_sections: [], ingredients: [ingredient], steps: [] };
    const first = buildRecipeImport(current(), flat, { kind: 'whole' }, options);
    const second = buildRecipeImport(first, flat, { kind: 'whole' }, options);
    expect(second.sections.map((s) => s.name)).toEqual(['Chicken', source.name, source.name]);
    expect(new Set(second.ingredients.map((r) => r.key)).size).toBe(3);
    expect(second.draft.notes.match(/From Chicken/g)).toHaveLength(1);
    expect(second.steps).toEqual(current().steps);
  });
  it('ignores unavailable Food outside the chosen section but blocks unavailable selected Food', () => {
    const changed = { ...source, ingredients: source.ingredients!.map((r) => r.section_position === 0 ? { ...r, catalog_item_id: 'archived' } : r) };
    expect(() => buildRecipeImport(current(), changed, { kind: 'section', position: 1 }, options)).not.toThrow();
    expect(() => buildRecipeImport(current(), changed, { kind: 'whole' }, options)).toThrow('Food items are unavailable: Butter');
  });
  it.each([
    ['empty', { ...source, ingredients: [] }, { kind: 'whole' }],
    ['missing group', source, { kind: 'section', position: 99 }],
    ['empty group', source, { kind: 'section', position: 2 }],
    ['incomplete', { ...source, steps: undefined }, { kind: 'whole' }],
    ['wrong home', { ...source, household_id: 'other' }, { kind: 'whole' }],
    ['archived', { ...source, archived_at: 'today' }, { kind: 'whole' }],
  ] as [string, Recipe, RecipeImportSelection][])('rejects %s without changing the destination', (_label, candidate, selection) => {
    const dest = current(); const before = JSON.stringify(dest);
    expect(() => buildRecipeImport(dest, candidate, selection, options)).toThrow();
    expect(JSON.stringify(dest)).toBe(before);
  });
  it('rejects self-import and a removed destination', () => {
    expect(() => buildRecipeImport(current(), source, { kind: 'whole' }, { ...options, destinationRecipeId: 'source' })).toThrow('another');
    expect(() => buildRecipeImport(current(), source, { kind: 'whole' }, { ...options, sectionKey: 'missing' })).toThrow('destination section changed');
  });
  it.each(['ingredients', 'sections', 'steps', 'notes'])('rejects the entire addition over the %s limit', (limit) => {
    const dest = current();
    if (limit === 'ingredients') dest.ingredients = Array.from({ length: 199 }, (_, i) => ({ ...oldRow, key: String(i) }));
    if (limit === 'sections') dest.sections = Array.from({ length: 20 }, (_, i) => ({ key: String(i), name: 'Group' }));
    if (limit === 'steps') dest.steps = Array.from({ length: 199 }, (_, i) => ({ key: String(i), instruction: 'Do' }));
    if (limit === 'notes') dest.draft.notes = 'a'.repeat(10000);
    const before = JSON.stringify(dest);
    expect(() => buildRecipeImport(dest, source, { kind: 'whole' }, options)).toThrow();
    expect(JSON.stringify(dest)).toBe(before);
  });
  it('a section does not consume direction or attribution capacity', () => {
    const dest = current(); dest.steps = Array.from({ length: 200 }, (_, i) => ({ key: String(i), instruction: 'Do' })); dest.draft.notes = 'a'.repeat(10000);
    expect(buildRecipeImport(dest, source, { kind: 'section', position: 1 }, options).steps).toEqual(dest.steps);
  });
  it('derives valid section labels from long or whitespace names', () => {
    expect(importedSectionName(' A   B ')).toBe('A B'); expect(importedSectionName('')).toBe('Imported recipe'); expect(Array.from(importedSectionName('🥣'.repeat(90)))).toHaveLength(80);
  });
});
