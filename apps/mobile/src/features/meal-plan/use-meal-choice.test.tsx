import { act, renderHook } from '@testing-library/react-native';
import { useMealChoice } from './use-meal-choice';
it('keeps each kind draft when switching and invalidates late recipe returns', async () => {
  const { result } = await renderHook(() => useMealChoice({ kind: 'recipe', recipeId: 'soup' }));
  const creation = result.current.captureSelection();
  await act(async () => { result.current.selectType('leftovers'); result.current.changeDetail('Chicken tacos'); });
  expect(result.current.selectionIsCurrent(creation)).toBe(false);
  await act(async () => { result.current.selectType('eating_out'); result.current.changeDetail('Cafe'); });
  expect(result.current.choice).toEqual({ kind: 'eating_out', detail: 'Cafe' });
  await act(async () => result.current.selectType('recipe'));
  expect(result.current.choice).toEqual({ kind: 'recipe', recipeId: 'soup' });
  await act(async () => result.current.selectType('leftovers'));
  expect(result.current.choice).toEqual({ kind: 'leftovers', detail: 'Chicken tacos' });
  await act(async () => result.current.selectType('eating_out'));
  expect(result.current.choice).toEqual({ kind: 'eating_out', detail: 'Cafe' });
});
it('initializes an existing special entry without a recipe selection', async () => {
  const { result } = await renderHook(() => useMealChoice({ kind: 'leftovers', detail: 'Roast' }));
  expect(result.current.choice).toEqual({ kind: 'leftovers', detail: 'Roast' });
  await act(async () => result.current.selectRecipe('pasta'));
  expect(result.current.choice).toEqual({ kind: 'recipe', recipeId: 'pasta' });
  await act(async () => result.current.selectType('leftovers'));
  expect(result.current.choice).toEqual({ kind: 'leftovers', detail: 'Roast' });
});
