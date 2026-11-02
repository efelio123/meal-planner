import type { Recipe, RecipeIngredient } from '@/lib/api';
import { ingredientDraftFromRecipe, newCreateRequestId, type RecipeDraft, type RecipeIngredientDraft, type RecipeDirectionDraft } from './recipe-form-utils';
import { orderedSectionIngredients, type RecipeSectionDraft } from './recipe-sections';

export type RecipeImportSelection = { kind: 'whole' } | { kind: 'section'; position: number | null };
export type RecipeImportDraft = { draft: RecipeDraft; ingredients: RecipeIngredientDraft[]; sections: RecipeSectionDraft[]; steps: RecipeDirectionDraft[] };
export function importedSectionName(name: string) {
  return Array.from(name.replace(/\s+/gu, ' ').trim()).slice(0, 80).join('') || 'Imported recipe';
}
export function recipeImportIngredients(source: Recipe, selection: RecipeImportSelection): RecipeIngredient[] {
  if (!source.ingredients || !source.steps) throw new Error('Recipe details are incomplete. Refresh and try again.');
  const sections = source.ingredient_sections ?? [];
  const positions = new Set(sections.map((section) => section.position));
  if (positions.size !== sections.length || source.ingredients.some((row) => row.section_position != null && !positions.has(row.section_position))) throw new Error('Recipe sections changed. Refresh and try again.');
  if (selection.kind === 'section' && selection.position !== null && !positions.has(selection.position)) throw new Error('This section is no longer available. Refresh and try again.');
  const ordered = [...source.ingredients].sort((a, b) => a.position - b.position);
  const rows = selection.kind === 'section'
    ? ordered.filter((row) => (row.section_position ?? null) === selection.position)
    : [...[...sections].sort((a, b) => a.position - b.position).flatMap((section) => ordered.filter((row) => row.section_position === section.position)), ...ordered.filter((row) => row.section_position == null)];
  if (rows.length === 0) throw new Error('There are no ingredients to import from this selection.');
  return rows;
}

/** Build a complete independent addition before the editor changes any state. */
export function buildRecipeImport(current: RecipeImportDraft, source: Recipe, selection: RecipeImportSelection, options: {
  householdId: string; destinationRecipeId?: string; sectionKey: string | null; activeFoodIds: ReadonlySet<string>;
}) {
  if (source.household_id !== options.householdId || source.archived_at || source.id === options.destinationRecipeId) throw new Error('Choose another active recipe from this household.');
  if (options.sectionKey !== null && !current.sections.some((section) => section.key === options.sectionKey)) throw new Error('The destination section changed. Close Import and try again.');
  const rows = recipeImportIngredients(source, selection);
  const missing = rows.filter((row) => !options.activeFoodIds.has(row.catalog_item_id));
  if (missing.length) {
    const names = [...new Set(missing.map((row) => importedSectionName(row.catalog_item_name)))];
    throw new Error(`These Food items are unavailable: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}. Refresh or restore them before importing.`);
  }
  const sections = [...current.sections];
  const mapping = new Map<number | null, string | null>();
  const addSection = (name: string) => {
    const section = { key: `section-${newCreateRequestId()}`, name: importedSectionName(name) };
    sections.push(section); return section.key;
  };
  if (options.sectionKey !== null) {
    for (const row of rows) mapping.set(row.section_position ?? null, options.sectionKey);
  } else if (selection.kind === 'section') {
    mapping.set(selection.position, selection.position === null ? null : addSection(source.ingredient_sections!.find((section) => section.position === selection.position)!.name));
  } else if (source.ingredient_sections?.length) {
    for (const section of [...source.ingredient_sections].sort((a, b) => a.position - b.position)) mapping.set(section.position, addSection(section.name));
    mapping.set(null, null);
  } else mapping.set(null, addSection(source.name));
  const added = rows.map((row) => ({ ...ingredientDraftFromRecipe(row), sectionKey: mapping.get(row.section_position ?? null) ?? null }));
  const importedSteps = selection.kind === 'whole' ? [...source.steps!].sort((a, b) => a.position - b.position).map((step) => ({ key: newCreateRequestId(), instruction: step.instruction })) : [];
  const steps = [...current.steps, ...importedSteps];
  let notes = current.draft.notes;
  if (selection.kind === 'whole' && source.source_url) {
    const attribution = `From ${source.name}: ${source.source_url}`;
    if (!notes.split('\n').includes(attribution)) notes = `${notes}${notes ? '\n\n' : ''}${attribution}`;
  }
  if (current.ingredients.length + added.length > 200) throw new Error('This import would exceed 200 ingredients. Remove some ingredients first.');
  if (sections.length > 20) throw new Error('This import would exceed 20 sections. Remove some sections first.');
  if (selection.kind === 'whole' && steps.length > 200) throw new Error('This import would exceed 200 direction steps. Remove some steps first.');
  if (selection.kind === 'whole' && Array.from(notes).length > 10000) throw new Error('There is not enough room in Notes for the source reference. Shorten your notes first.');
  return {
    draft: notes === current.draft.notes ? current.draft : { ...current.draft, notes },
    sections, ingredients: orderedSectionIngredients([...current.ingredients, ...added], sections), steps,
    ingredientCount: added.length, directionCount: importedSteps.length,
    label: selection.kind === 'whole' ? source.name : selection.position === null ? 'Other ingredients' : source.ingredient_sections!.find((section) => section.position === selection.position)!.name,
  };
}
