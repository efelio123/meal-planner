import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { api, type Recipe } from '@/lib/api';
import { RecipeImportSheet } from './recipe-import-sheet';

const mockBack = jest.fn(); const mockDismiss = jest.fn(); const mockFlow = { scope: 'session:home' };
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, dismiss: mockDismiss }), useFocusEffect: (callback: () => void) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ selectedHousehold: { id: 'home', role: 'owner' } }) }));
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => mockFlow }));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), api: { recipes: jest.fn(), recipe: jest.fn(), catalogItems: jest.fn() } }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react'); const { View } = jest.requireActual('react-native');
  return { SymbolView: (props: object) => React.createElement(View, props) };
});
const mocked = jest.mocked(api);
const row = { id: 'i', catalog_item_id: 'food', catalog_item_name: 'Butter', category_emoji: null, amount: '1/2', unit_code: null, unit_label: null, custom_unit_label: null, note: null, position: 0, section_position: 0 };
const source: Recipe = { id: 'source', household_id: 'home', name: 'Chicken and mash', cover_kind: 'initials', cover_emoji: null, servings: 4, prep_minutes: null, cook_minutes: null, notes: null, source_url: null, edit_revision: 1, archived_at: null, created_at: '', updated_at: '', ingredient_count: 1, ingredient_section_count: 1, ingredient_sections: [{ id: 's', position: 0, name: 'Mash' }], ingredients: [row], steps: [] };
const token = jest.fn().mockResolvedValue('token'); const isCurrent = jest.fn(() => true); const apply = jest.fn< string | null, Parameters<ComponentProps<typeof RecipeImportSheet>['onImport']>>(() => null);
function view() { return <RecipeImportSheet requiredPermission="recipes.create" householdId="home" expectedFlowScope="session:home" getToken={token} isCurrent={isCurrent} destinationName={null} onImport={apply} />; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.clearAllMocks(); isCurrent.mockReturnValue(true); mockFlow.scope = 'session:home'; apply.mockReturnValue(null);
  mocked.recipes.mockResolvedValue({ recipes: [source] }); mocked.recipe.mockResolvedValue({ recipe: source });
  mocked.catalogItems.mockResolvedValue({ items: [{ id: 'food', household_id: 'home', item_type: 'food' }] as never });
});
it('loads details lazily, keeps multiple expansions across search and uses native header/body siblings', async () => {
  mocked.recipes.mockResolvedValue({ recipes: [source, { ...source, id: 'second', name: 'Second dinner' }] });
  mocked.recipe.mockImplementation(async (_t, _h, id) => ({ recipe: { ...source, id } }));
  await render(view()); await screen.findByRole('button', { name: 'Expand Chicken and mash' });
  expect(mocked.recipe).not.toHaveBeenCalled();
  const root = screen.getByTestId('recipe-import-sheet'); const header = screen.getByTestId('recipe-import-header'); const body = screen.getByTestId('recipe-import-results');
  expect(root.props.collapsable).toBe(false); expect(header.props.collapsable).toBe(false); expect(header.parent).toBe(body.parent);
  expect(StyleSheet.flatten(body.props.style)).toMatchObject({ flex: 1, minHeight: 0 }); expect(body.props.automaticallyAdjustContentInsets).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Expand Chicken and mash' }));
  await screen.findByRole('button', { name: 'Import Mash ingredients from Chicken and mash' });
  await fireEvent.press(screen.getByRole('button', { name: 'Expand Second dinner' }));
  await screen.findByRole('button', { name: 'Import Mash ingredients from Second dinner' });
  await fireEvent.changeText(screen.getByLabelText('Search recipes to import'), 'Chicken');
  expect(screen.queryByRole('button', { name: 'Expand Second dinner' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search recipes to import'), '');
  expect(screen.getByRole('button', { name: 'Expand Second dinner' }).props.accessibilityState.expanded).toBe(true);
  expect(mocked.recipe).toHaveBeenCalledTimes(2);
});
it('uses safe fallback expansion when older summaries omit the section count', async () => {
  mocked.recipes.mockResolvedValue({ recipes: [{ ...source, ingredient_section_count: undefined }] });
  await render(view()); await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  expect(await screen.findByRole('button', { name: 'Import Mash ingredients from Chicken and mash' })).toBeTruthy();
});
it('refreshes summaries and invalidates cached detail snapshots', async () => {
  await render(view()); await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' })); await screen.findByRole('button', { name: 'Import Mash ingredients from Chicken and mash' });
  mocked.recipe.mockResolvedValue({ recipe: { ...source, ingredient_sections: [{ id: 's', position: 0, name: 'Potatoes' }] } });
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh recipes to import' }));
  await waitFor(() => expect(mocked.recipes).toHaveBeenCalledTimes(2));
  await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  await screen.findByRole('button', { name: 'Import Potatoes ingredients from Chicken and mash' });
  expect(screen.queryByRole('button', { name: 'Import Mash ingredients from Chicken and mash' })).toBeNull(); expect(mocked.recipe).toHaveBeenCalledTimes(2);
});
it('retries failed list/detail reads without an import and keeps the sheet on failed validation', async () => {
  mocked.recipes.mockRejectedValueOnce(new Error('offline')); await render(view());
  await fireEvent.press(await screen.findByRole('button', { name: 'Retry loading recipes' }));
  mocked.recipe.mockRejectedValueOnce(new Error('detail offline'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Retry Chicken and mash' }));
  await screen.findByRole('button', { name: 'Import Mash ingredients from Chicken and mash' });
  apply.mockReturnValue('Restore Butter before importing.');
  await fireEvent.press(screen.getByRole('button', { name: 'Import Mash ingredients from Chicken and mash' }));
  await screen.findByText('Restore Butter before importing.'); expect(mockDismiss).not.toHaveBeenCalled();
  apply.mockReturnValue(null);
  await fireEvent.press(screen.getByRole('button', { name: 'Import Mash ingredients from Chicken and mash' }));
  await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith(2));
});
it('ignores a pending import after the sheet is removed', async () => {
  const catalog = deferred<Awaited<ReturnType<typeof api.catalogItems>>>(); mocked.catalogItems.mockReturnValue(catalog.promise);
  const rendered = await render(view()); await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import whole recipe Chicken and mash' }));
  await waitFor(() => expect(mocked.catalogItems).toHaveBeenCalledTimes(1));
  await rendered.unmount(); await act(async () => catalog.resolve({ items: [] }));
  expect(apply).not.toHaveBeenCalled(); expect(mockDismiss).not.toHaveBeenCalled();
});
it.each(['household', 'editor'])('ignores pending results after %s changes', async (change) => {
  const details = deferred<{ recipe: Recipe }>(); mocked.recipe.mockReturnValue(details.promise);
  await render(view()); await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  if (change === 'household') mockFlow.scope = 'other'; else isCurrent.mockReturnValue(false);
  await act(async () => details.resolve({ recipe: source })); expect(screen.queryByRole('button', { name: 'Import Mash ingredients from Chicken and mash' })).toBeNull(); expect(apply).not.toHaveBeenCalled();
});
it('ignores old details when a refresh races the original expansion', async () => {
  const details = deferred<{ recipe: Recipe }>(); mocked.recipe.mockReturnValueOnce(details.promise);
  await render(view()); await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh recipes to import' }));
  await act(async () => details.resolve({ recipe: source }));
  expect(screen.queryByRole('button', { name: 'Import Mash ingredients from Chicken and mash' })).toBeNull();
  await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  await screen.findByRole('button', { name: 'Import Mash ingredients from Chicken and mash' }); expect(mocked.recipe).toHaveBeenCalledTimes(2);
});
it('applies a delayed selection once and passes only active household Food references', async () => {
  const catalog = deferred<Awaited<ReturnType<typeof api.catalogItems>>>(); mocked.catalogItems.mockReturnValue(catalog.promise);
  await render(view()); await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  const button = await screen.findByRole('button', { name: 'Import Mash ingredients from Chicken and mash' });
  await fireEvent.press(button); await fireEvent.press(button);
  await act(async () => catalog.resolve({ items: [{ id: 'food', household_id: 'home', item_type: 'food' }, { id: 'wrong', household_id: 'other', item_type: 'food' }, { id: 'soap', household_id: 'home', item_type: 'household' }] as never }));
  expect(apply).toHaveBeenCalledTimes(1); expect(apply).toHaveBeenCalledWith(source, { kind: 'section', position: 0 }, new Set(['food'])); expect(mockDismiss).toHaveBeenCalledTimes(1);
});
it('blocks archived or cross-household details and permits Back after an error', async () => {
  mocked.recipe.mockResolvedValue({ recipe: { ...source, archived_at: 'now' } });
  await render(view()); await fireEvent.press(await screen.findByRole('button', { name: 'Expand Chicken and mash' }));
  await screen.findByText('This recipe is unavailable. Refresh and try again.');
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Food Catalog' })); expect(mockBack).toHaveBeenCalledTimes(1); expect(apply).not.toHaveBeenCalled();
});
