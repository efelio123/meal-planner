import { useAuth } from '@clerk/expo';
import { Link, Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdState } from '@/hooks/use-household-state';
import { ApiError, api, type CatalogCategory, type CatalogChoice, type CatalogItemType, type GetToken } from '@/lib/api';
import type { CatalogChoiceKind } from './catalog-context';
import { useCatalogContext } from './catalog-context';
import { CatalogEmojiInputSheet } from './catalog-emoji-input-sheet';
import { categoryEmojiValidationError } from './catalog-emoji-validation';

function isKind(value: string | undefined): value is CatalogChoiceKind {
  return value === 'category' || value === 'store' || value === 'shopping-unit';
}

type ManagedChoice = CatalogChoice & { item_type?: CatalogItemType; emoji?: string | null; active_item_count?: number };

async function loadChoices(getToken: GetToken, householdId: string, kind: CatalogChoiceKind, itemType?: CatalogItemType): Promise<ManagedChoice[]> {
  if (kind === 'category') {
    return (await api.catalogCategories(getToken, householdId, itemType)).categories;
  }
  if (kind === 'store') return (await api.catalogStores(getToken, householdId)).stores;
  return (await api.catalogUnits(getToken, householdId)).shopping_units.household.map((unit) => ({ id: unit.id!, name: unit.label, created_at: '', updated_at: '' }));
}

export function CatalogChoiceManagement() {
  const params = useLocalSearchParams<{ kind: string; itemType?: string }>();
  const kind = isKind(params.kind) ? params.kind : null;
  const itemType = params.itemType === 'food' || params.itemType === 'household' ? params.itemType : undefined;
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken, selectedHousehold } = useHouseholdState();
  const theme = useTheme();
  const { sessionId, userId } = useAuth();
  const { revision } = useCatalogContext();
  const householdId = selectedHousehold?.id ?? null;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${kind ?? ''}:${itemType ?? ''}`;
  const latestGetToken = useRef<GetToken>(getToken);
  const generation = useRef(0);
  const scopeRef = useRef(scope);
  const [choices, setChoices] = useState<ManagedChoice[]>([]);
  const [choicesScope, setChoicesScope] = useState(scope);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useLayoutEffect(() => { scopeRef.current = scope; }, [scope]);
  const refreshChoices = useCallback(async () => {
    if (!householdId || !kind) return;
    const requestGeneration = ++generation.current;
    const requestScope = scope;
    setLoading(true);
    setError(null);
    try {
      const rows = await loadChoices(() => latestGetToken.current(), householdId, kind, itemType);
      if (generation.current === requestGeneration && scopeRef.current === requestScope) {
        setChoices(rows);
        setChoicesScope(requestScope);
      }
    } catch (reason) {
      if (generation.current === requestGeneration && scopeRef.current === requestScope) {
        setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'We couldn’t load these choices. Please try again.');
      }
    } finally {
      if (generation.current === requestGeneration && scopeRef.current === requestScope) setLoading(false);
    }
  }, [householdId, itemType, kind, scope]);
  useEffect(() => {
    const timer = setTimeout(() => { void refreshChoices(); }, 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [refreshChoices, revision]);

  const title = kind === 'category' ? 'Categories' : kind === 'store' ? 'Stores' : 'Shopping units';
  const routeToCreate = useCallback(() => {
    if (!kind) return;
    router.push(`/(app)/(tabs)/catalog/choices/${kind}/create${itemType ? `?itemType=${itemType}` : ''}` as never);
  }, [itemType, kind, router]);
  const createAction = useCallback(() => (
    <Pressable accessibilityLabel={`Create ${kind === 'shopping-unit' ? 'shopping unit' : kind ?? 'choice'}`} accessibilityRole="button" onPress={routeToCreate} style={styles.headerAction}>
      <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} tintColor={theme.link} />
    </Pressable>
  ), [kind, routeToCreate, theme.link]);
  useLayoutEffect(() => {
    navigation.setOptions({ title, headerRight: kind ? createAction : undefined });
  }, [createAction, kind, navigation, title]);
  const groupedChoices = kind === 'category'
    ? (['food', 'household'] as const).map((type) => ({
      type,
      choices: choices.filter((choice) => (choice as ManagedChoice).item_type === type),
    })).filter((group) => group.choices.length > 0)
    : [{ type: undefined, choices }];
  const searchable = kind === 'category' || kind === 'store';
  const filterGroup = (groupChoices: ManagedChoice[]) => groupChoices.filter((choice) => choice.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return (
    <View style={styles.routeRoot}>
      <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
        <View style={styles.content}>
        <ThemedText themeColor="textSecondary">Manage {title.toLocaleLowerCase()} for this household.</ThemedText>
        {searchable ? <ThemedInput accessibilityLabel={`Search ${title.toLocaleLowerCase()}`} onChangeText={setSearch} placeholder={`Search ${title.toLocaleLowerCase()}`} value={search} /> : null}
        {loading ? <ActivityIndicator accessibilityLabel={`Loading ${title.toLocaleLowerCase()}`} /> : null}
        {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
        {error && !loading ? <PrimaryButton onPress={() => void refreshChoices()} title="Retry loading choices" /> : null}
        {!loading && choices.length === 0 ? <ThemedText themeColor="textSecondary">{kind === 'shopping-unit' ? 'No custom shopping units yet. Built-in units are available when adding or editing items.' : `No active ${title.toLocaleLowerCase()} yet.`}</ThemedText> : null}
        {!loading && choices.length > 0 && groupedChoices.every((group) => filterGroup(group.choices).length === 0) ? <ThemedText themeColor="textSecondary">No matching {title.toLocaleLowerCase()}.</ThemedText> : null}
        {choicesScope === scope ? groupedChoices.map((group) => (
          filterGroup(group.choices).length > 0 ? (
          <View key={group.type ?? kind} style={styles.group}>
            {group.type ? <ThemedText accessibilityRole="header" style={styles.groupTitle}>{group.type === 'food' ? 'Food' : 'Household'}</ThemedText> : null}
            <View style={[styles.choiceCard, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
              {filterGroup(group.choices).map((choice, index) => {
                const choiceType = (choice as ManagedChoice).item_type ?? itemType;
                return (
                  <Link key={choice.id} href={`/(app)/(tabs)/catalog/choices/${kind ?? 'category'}/${choice.id}${choiceType ? `?itemType=${choiceType}` : ''}` as never} asChild>
                    <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }])}>
                      {(choice as ManagedChoice).emoji ? <ThemedText style={styles.choiceEmoji}>{(choice as ManagedChoice).emoji}</ThemedText> : null}
                      <ThemedText style={styles.choiceName}>{choice.name}</ThemedText>
                      <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={18} tintColor={theme.textSecondary} />
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          </View>
          ) : null
        )) : null}
        {kind && (kind !== 'category' || itemType) && !choices.length && !loading ? <PrimaryButton onPress={routeToCreate} title={`Create ${kind === 'shopping-unit' ? 'shopping unit' : kind}`} /> : null}
        </View>
      </Screen>
    </View>
  );
}

export function CatalogChoiceForm(props: { editing?: boolean }) {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  return kind === 'category' ? <CatalogCategoryForm {...props} /> : <CatalogChoiceFormInternal {...props} />;
}

function CatalogChoiceFormInternal({ editing = false }: { editing?: boolean }) {
  const params = useLocalSearchParams<{ kind: string; choiceId?: string; itemType?: string }>();
  const kind = isKind(params.kind) ? params.kind : null;
  const itemType = params.itemType === 'food' || params.itemType === 'household' ? params.itemType : undefined;
  const choiceId = typeof params.choiceId === 'string' ? params.choiceId : null;
  const router = useRouter();
  const { sessionId, userId } = useAuth();
  const { getToken, selectedHousehold } = useHouseholdState();
  const navigation = useNavigation();
  const theme = useTheme();
  const { markChanged, setChoiceResult } = useCatalogContext();
  const householdId = selectedHousehold?.id ?? null;
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState<CatalogItemType | ''>(itemType ?? '');
  const [loadedCategoryType, setLoadedCategoryType] = useState<CatalogItemType | null>(null);
  const [loading, setLoading] = useState(Boolean(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestGetToken = useRef<GetToken>(getToken);
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${kind ?? ''}:${choiceId ?? ''}:${itemType ?? ''}`;
  const scopeRef = useRef(scope);
  const previousScope = useRef(scope);
  const loadGeneration = useRef(0);
  const [loadedChoiceScope, setLoadedChoiceScope] = useState<string | null>(null);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    setName('');
    setCategoryType(itemType ?? '');
    setLoadedCategoryType(null);
    setError(null);
    setLoading(Boolean(editing));
    setLoadedChoiceScope(null);
  }, [editing, itemType, scope]);
  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const loadExistingChoice = useCallback(async () => {
    if (!editing) return;
    const requestScope = scope;
    const requestGeneration = ++loadGeneration.current;
    if (!householdId || !kind || !choiceId) {
      setLoading(false);
      setError('This choice could not be identified. Return to the catalog and try again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await loadChoices(() => latestGetToken.current(), householdId, kind, itemType);
      const choice = rows.find((row) => row.id === choiceId);
      if (loadGeneration.current !== requestGeneration || scopeRef.current !== requestScope) return;
      if (!choice) {
        setError('This choice is no longer active. Return to the catalog manager and refresh.');
        return;
      }
      setName(choice.name);
      if (kind === 'category') {
        const choiceType = (choice as ManagedChoice).item_type;
        if (choiceType) {
          setLoadedCategoryType(choiceType);
          setCategoryType(choiceType);
        }
      }
      setLoadedChoiceScope(requestScope);
    } catch (reason) {
      if (loadGeneration.current === requestGeneration && scopeRef.current === requestScope) {
        setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'We couldn’t load this choice. Please try again.');
      }
    } finally {
      if (loadGeneration.current === requestGeneration && scopeRef.current === requestScope) setLoading(false);
    }
  }, [choiceId, editing, householdId, itemType, kind, scope]);
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => { void loadExistingChoice(); }, 0);
    return () => { clearTimeout(timer); loadGeneration.current += 1; };
  }, [editing, loadExistingChoice]);

  const save = async () => {
    if (editing && loadedChoiceScope !== scope) return;
    if (!householdId || !kind || !name.trim()) { setError('Enter a name.'); return; }
    if (kind === 'category' && !categoryType) { setError('Choose Food or Household for this category.'); return; }
    setSaving(true); setError(null);
    const startedScope = scopeRef.current;
    try {
      let saved: CatalogChoice;
      if (kind === 'category') saved = (await (editing && choiceId
        ? api.updateCatalogCategory(() => latestGetToken.current(), householdId, choiceId, name.trim(), null)
        : api.createCatalogCategory(() => latestGetToken.current(), householdId, categoryType as CatalogItemType, name.trim(), null))).category;
      else if (kind === 'store') saved = (await (editing && choiceId
        ? api.updateCatalogStore(() => latestGetToken.current(), householdId, choiceId, name.trim())
        : api.createCatalogStore(() => latestGetToken.current(), householdId, name.trim()))).store;
      else saved = (await (editing && choiceId
        ? api.updateCatalogShoppingUnit(() => latestGetToken.current(), householdId, choiceId, name.trim())
        : api.createCatalogShoppingUnit(() => latestGetToken.current(), householdId, name.trim()))).unit;
      if (!mounted.current || scopeRef.current !== startedScope) return;
      markChanged(editing ? 'all' : 'choices');
      if (!editing) setChoiceResult({ kind, id: saved.id, label: saved.name, itemType: kind === 'category' ? categoryType as CatalogItemType : undefined });
      router.back();
    } catch (reason) {
      if (mounted.current && scopeRef.current === startedScope) setError(reason instanceof ApiError ? reason.message : 'We couldn’t save this choice. Please try again.');
    } finally { if (mounted.current && scopeRef.current === startedScope) setSaving(false); }
  };

  const remove = async () => {
    if (!householdId || !kind || !choiceId) return;
    setSaving(true); setError(null);
    const startedScope = scopeRef.current;
    try {
      if (kind === 'category') await api.deleteCatalogCategory(() => latestGetToken.current(), householdId, choiceId, 0);
      else if (kind === 'store') await api.deleteCatalogStore(() => latestGetToken.current(), householdId, choiceId);
      else await api.deleteCatalogShoppingUnit(() => latestGetToken.current(), householdId, choiceId);
      if (mounted.current && scopeRef.current === startedScope) {
        markChanged('all');
        router.back();
      }
    } catch (reason) {
      if (mounted.current && scopeRef.current === startedScope) setError(reason instanceof ApiError ? reason.message : 'We couldn’t remove this choice. Please try again.');
    } finally { if (mounted.current && scopeRef.current === startedScope) setSaving(false); }
  };

  const title = kind === 'category' ? 'category' : kind === 'store' ? 'store' : 'shopping unit';
  const pageTitle = `${editing ? 'Edit' : 'Create'} ${title}`;
  useLayoutEffect(() => { navigation.setOptions({ title: pageTitle }); }, [navigation, pageTitle]);
  return (
    <View style={styles.routeRoot}>
      <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}><View style={styles.content}>
      <ThemedText themeColor="textSecondary">{editing ? kind === 'store' ? 'Update this shared household store.' : kind === 'shopping-unit' ? 'Update this household shopping-unit label.' : 'Update this shared household category.' : kind === 'category' ? 'Organize reusable catalog items by type.' : `Add a household ${title} for catalog items.`}</ThemedText>
      {editing && householdId && kind && choiceId && loading ? <ActivityIndicator accessibilityLabel={`Loading ${title}`} /> : null}
      {editing && error && !loading && loadedChoiceScope !== scope ? <PrimaryButton onPress={() => void loadExistingChoice()} title={`Retry loading ${title}`} /> : null}
      {kind === 'category' ? <>
        <ThemedText style={styles.label}>Type</ThemedText>
        <View style={styles.categoryTypes}>
          {(['food', 'household'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: categoryType === value }} disabled={editing} onPress={() => setCategoryType(value)} style={[styles.categoryType, { backgroundColor: categoryType === value ? theme.surfaceSelected : theme.surface, borderColor: categoryType === value ? theme.primary : theme.border, opacity: editing ? 0.75 : 1 }]}>
              <ThemedText>{value === 'food' ? 'Food' : 'Household'}</ThemedText>
            </Pressable>
          ))}
        </View>
        {editing && loadedCategoryType ? <ThemedText themeColor="textSecondary">This category belongs to {loadedCategoryType === 'food' ? 'Food' : 'Household'}.</ThemedText> : null}
      </> : null}
      <ThemedText style={styles.label}>{title[0].toLocaleUpperCase() + title.slice(1)} name</ThemedText>
      <ThemedInput accessibilityLabel={`${title} name`} onChangeText={setName} placeholder={`${title[0].toLocaleUpperCase() + title.slice(1)} name`} value={name} />
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      <PrimaryButton disabled={!kind || saving || loading || (editing && loadedChoiceScope !== scope) || (kind === 'category' && !categoryType)} onPress={() => void save()} title={saving ? 'Saving…' : editing ? 'Save changes' : 'Create'} />
      {editing ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void remove()} style={[styles.deleteAction, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}><ThemedText themeColor="error">Remove {title}</ThemedText></Pressable> : null}
      </View></Screen>
    </View>
  );
}

function CatalogCategoryForm({ editing = false }: { editing?: boolean }) {
  const params = useLocalSearchParams<{ choiceId?: string; itemType?: string }>();
  const itemType = params.itemType === 'food' || params.itemType === 'household' ? params.itemType : undefined;
  const choiceId = typeof params.choiceId === 'string' ? params.choiceId : null;
  const { sessionId, userId } = useAuth();
  const { getToken, selectedHousehold } = useHouseholdState();
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();
  const { markChanged, setChoiceResult } = useCatalogContext();
  const householdId = selectedHousehold?.id ?? null;
  const scope = `${userId ?? ''}:${sessionId ?? ''}:${householdId ?? ''}:${choiceId ?? ''}:${itemType ?? ''}`;
  const scopeRef = useRef(scope);
  const previousScope = useRef(scope);
  const latestGetToken = useRef<GetToken>(getToken);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<CatalogItemType | ''>(itemType ?? '');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [emojiSheetVisible, setEmojiSheetVisible] = useState(false);
  const [emojiDraft, setEmojiDraft] = useState('');
  const [emojiDraftError, setEmojiDraftError] = useState<string | null>(null);
  const [activeItemCount, setActiveItemCount] = useState(0);
  const [loadedScope, setLoadedScope] = useState<string | null>(editing ? null : scope);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const title = editing ? 'Edit category' : 'Create category';

  useEffect(() => { latestGetToken.current = getToken; }, [getToken]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestGeneration.current += 1; };
  }, []);
  useLayoutEffect(() => {
    scopeRef.current = scope;
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    requestGeneration.current += 1;
    setCategoryName('');
    setCategoryType(itemType ?? '');
    setEmoji(null);
    setEmojiSheetVisible(false);
    setEmojiDraft('');
    setEmojiDraftError(null);
    setActiveItemCount(0);
    setLoadedScope(editing ? null : scope);
    setLoading(editing);
    setSaving(false);
    setError(null);
    setDeleteConfirmOpen(false);
  }, [editing, itemType, scope]);

  const loadExistingCategory = useCallback(async () => {
    if (!editing || !householdId || !choiceId) return null;
    const generation = ++requestGeneration.current;
    const requestScope = scope;
    setLoading(true);
    setError(null);
    try {
      const result = await api.catalogCategories(() => latestGetToken.current(), householdId, itemType);
      const category = result.categories.find((entry) => entry.id === choiceId);
      if (!mounted.current || generation !== requestGeneration.current || scopeRef.current !== requestScope) return null;
      if (!category) {
        setError('This category is no longer active. Return to Categories and refresh.');
        return null;
      }
      setCategoryName(category.name);
      setCategoryType(category.item_type);
      setEmoji(category.emoji);
      setActiveItemCount(category.active_item_count);
      setLoadedScope(requestScope);
      return category;
    } catch (reason) {
      if (mounted.current && generation === requestGeneration.current && scopeRef.current === requestScope) {
        setError(reason instanceof ApiError ? reason.message : 'We couldn’t load this category. Please try again.');
      }
      return null;
    } finally {
      if (mounted.current && generation === requestGeneration.current && scopeRef.current === requestScope) setLoading(false);
    }
  }, [choiceId, editing, householdId, itemType, scope]);

  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => { void loadExistingCategory(); }, 0);
    return () => { clearTimeout(timer); requestGeneration.current += 1; };
  }, [editing, loadExistingCategory]);

  const save = useCallback(async () => {
    if (emojiSheetVisible) {
      const validationError = categoryEmojiValidationError(emojiDraft);
      if (validationError) setEmojiDraftError(validationError);
      else {
        setEmoji(emojiDraft.trim() || null);
        setEmojiSheetVisible(false);
      }
      return;
    }
    const savedEmojiError = categoryEmojiValidationError(emoji ?? '');
    if (savedEmojiError) {
      setEmojiDraft(emoji ?? '');
      setEmojiDraftError(savedEmojiError);
      setEmojiSheetVisible(true);
      return;
    }
    if (editing && loadedScope !== scope) return;
    if (!householdId || !categoryName.trim()) { setError('Enter a category name.'); return; }
    if (!categoryType) { setError('Choose Food or Household for this category.'); return; }
    setSaving(true);
    setError(null);
    const requestScope = scopeRef.current;
    const generation = requestGeneration.current;
    try {
      let category: CatalogCategory;
      if (editing && choiceId) {
        category = (await api.updateCatalogCategory(() => latestGetToken.current(), householdId, choiceId, categoryName.trim(), emoji)).category;
      } else {
        category = (await api.createCatalogCategory(() => latestGetToken.current(), householdId, categoryType, categoryName.trim(), emoji)).category;
      }
      if (!mounted.current || scopeRef.current !== requestScope || requestGeneration.current !== generation) return;
      markChanged(editing ? 'all' : 'choices');
      if (!editing) setChoiceResult({ kind: 'category', id: category.id, label: category.name, itemType: category.item_type });
      router.back();
    } catch (reason) {
      if (mounted.current && scopeRef.current === requestScope && requestGeneration.current === generation) {
        setError(reason instanceof ApiError ? reason.message : 'We couldn’t save this category. Please try again.');
      }
    } finally {
      if (mounted.current && scopeRef.current === requestScope) setSaving(false);
    }
  }, [categoryName, categoryType, choiceId, editing, emoji, emojiDraft, emojiSheetVisible, householdId, loadedScope, markChanged, router, scope, setChoiceResult]);

  const openEmojiSheet = () => {
    Keyboard.dismiss();
    setEmojiDraft(emoji ?? '');
    setEmojiDraftError(null);
    setEmojiSheetVisible(true);
  };
  const updateEmojiDraft = (value: string) => {
    setEmojiDraft(value);
    setEmojiDraftError(categoryEmojiValidationError(value));
  };
  const finishEmojiEdit = () => {
    const validationError = categoryEmojiValidationError(emojiDraft);
    setEmojiDraftError(validationError);
    if (validationError) return;
    setEmoji(emojiDraft.trim() || null);
    setEmojiSheetVisible(false);
  };
  const cancelEmojiEdit = () => {
    setEmojiDraft(emoji ?? '');
    setEmojiDraftError(null);
    setEmojiSheetVisible(false);
  };

  const categoryLoaded = !editing || loadedScope === scope;
  const saveHeaderAction = useCallback(() => (
    <Pressable accessibilityRole="button" accessibilityLabel="Save category" accessibilityState={{ disabled: loadedScope !== scope || saving || loading || emojiSheetVisible }} disabled={loadedScope !== scope || saving || loading || emojiSheetVisible} onPress={() => void save()} style={styles.headerAction}>
      <ThemedText themeColor="link">Save</ThemedText>
    </Pressable>
  ), [emojiSheetVisible, loadedScope, loading, save, saving, scope]);

  const remove = async () => {
    if (!householdId || !choiceId || loadedScope !== scope) return;
    setSaving(true);
    setError(null);
    const requestScope = scopeRef.current;
    const generation = requestGeneration.current;
    try {
      await api.deleteCatalogCategory(() => latestGetToken.current(), householdId, choiceId, activeItemCount);
      if (!mounted.current || scopeRef.current !== requestScope || requestGeneration.current !== generation) return;
      markChanged('all');
      router.back();
    } catch (reason) {
      if (!mounted.current || scopeRef.current !== requestScope || requestGeneration.current !== generation) return;
      if (reason instanceof ApiError && reason.code === 'CATALOG_CATEGORY_COUNT_CHANGED') {
        const latestCategory = await loadExistingCategory();
        if (latestCategory && mounted.current && scopeRef.current === requestScope) {
          setError(`The active-item count changed. It is now ${latestCategory.active_item_count}. Review the updated count and confirm deletion again.`);
        }
      } else {
        setError(reason instanceof ApiError ? reason.message : 'We couldn’t delete this category. Please try again.');
      }
    } finally {
      if (mounted.current && scopeRef.current === requestScope) setSaving(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({ title, headerRight: Platform.OS === 'ios' || !editing || !categoryLoaded ? undefined : saveHeaderAction });
  }, [categoryLoaded, editing, navigation, saveHeaderAction, title]);

  return (
    <>
    <Stack.Screen options={{ title }} />
    {Platform.OS === 'ios' && editing && categoryLoaded ? <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button accessibilityLabel="Save category" disabled={saving || loading || emojiSheetVisible} hidesSharedBackground onPress={() => void save()} tintColor={theme.link} variant="plain">Save</Stack.Toolbar.Button>
    </Stack.Toolbar> : null}
    <View style={styles.routeRoot}>
      <Screen contentAlignment="top" safeAreaEdges={['left', 'right']}>
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">{editing ? 'Update this shared household category.' : 'Create a category shared with everyone in your household.'}</ThemedText>
          {editing && loading ? <ActivityIndicator accessibilityLabel="Loading category" /> : null}
          {editing && error && !categoryLoaded ? <PrimaryButton disabled={loading} onPress={() => void loadExistingCategory()} title="Retry loading category" /> : null}
          {categoryLoaded ? <>
            <View style={[styles.categoryFormCard, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
              <View style={styles.compactFormRow}>
                <ThemedText themeColor="textSecondary">Name</ThemedText>
                <ThemedInput accessibilityLabel="category name" onChangeText={setCategoryName} placeholder="Category name" value={categoryName} style={editing ? styles.inlineInput : undefined} />
              </View>
              <View style={[styles.typeRow, { borderTopColor: theme.border }]}>
                <ThemedText themeColor="textSecondary">Type</ThemedText>
                {editing ? <View testID="category-type-value" style={styles.categoryTrailingValue}><ThemedText>{categoryType === 'food' ? 'Food' : 'Household'}</ThemedText></View> : (
                  <View style={styles.categoryTypes}>
                    {(['food', 'household'] as const).map((value) => (
                      <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: categoryType === value }} onPress={() => setCategoryType(value)} style={[styles.categoryType, { backgroundColor: categoryType === value ? theme.surfaceSelected : theme.surface, borderColor: categoryType === value ? theme.primary : theme.border }]}>
                        <ThemedText>{value === 'food' ? 'Food' : 'Household'}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
            <Pressable accessibilityLabel={`Emoji: ${emoji ?? 'Not set'}`} accessibilityRole="button" onPress={openEmojiSheet} style={[styles.categorySettingRow, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
              <ThemedText>Emoji</ThemedText><ThemedText style={styles.emojiPreview}>{emoji ?? '—'}</ThemedText><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={theme.textSecondary} />
            </Pressable>
            {editing ? <>
              <View style={[styles.categorySettingRow, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
                <ThemedText style={styles.categoryCountLabel}>Items in this category</ThemedText><ThemedText testID="category-item-count" style={styles.categoryTrailingText} themeColor="textSecondary">{activeItemCount} {activeItemCount === 1 ? 'item' : 'items'}</ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">{activeItemCount ? 'Deleting this category moves its active items to Uncategorized.' : 'No active items use this category.'}</ThemedText>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => setDeleteConfirmOpen(true)} style={[styles.deleteAction, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}><ThemedText themeColor="error">Delete category</ThemedText></Pressable>
            </> : null}
          </> : null}
          {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
          {!editing ? <PrimaryButton accessibilityLabel="Create" disabled={saving || loading || !categoryType || emojiSheetVisible} onPress={() => void save()} title={saving ? 'Creating…' : 'Create category'} /> : null}
          {editing && error && categoryLoaded ? <PrimaryButton disabled={saving || loading} onPress={() => void loadExistingCategory()} title="Retry refresh category" /> : null}
        </View>
      </Screen>

      <CatalogEmojiInputSheet
        visible={emojiSheetVisible}
        value={emojiDraft}
        error={emojiDraftError}
        onChangeText={updateEmojiDraft}
        onClear={() => updateEmojiDraft('')}
        onCancel={cancelEmojiEdit}
        onDone={finishEmojiEdit}
      />

      <Modal animationType="fade" onRequestClose={() => setDeleteConfirmOpen(false)} transparent visible={deleteConfirmOpen}>
        <View style={styles.confirmOverlay}>
            <View style={[styles.confirmCard, { backgroundColor: theme.elevatedSurface, borderColor: theme.surfaceSelected }]}>
            <ThemedText accessibilityRole="header" style={styles.confirmTitle}>Delete category?</ThemedText>
            <ThemedText>{activeItemCount ? `Deleting “${categoryName}” will move ${activeItemCount} active ${activeItemCount === 1 ? 'item' : 'items'} to Uncategorized.` : `Delete “${categoryName}”?`}</ThemedText>
            {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void remove()} style={[styles.confirmDeleteButton, { backgroundColor: theme.errorSurface, borderColor: theme.error }]}><ThemedText themeColor="error">{saving ? 'Deleting…' : 'Delete category'}</ThemedText></Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => setDeleteConfirmOpen(false)} style={styles.cancelDeleteButton}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
          </View>
        </View>
      </Modal>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  routeRoot: { flex: 1 },
  content: { gap: 16, paddingBottom: 16 },
  label: { fontWeight: '600' },
  headerAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  group: { gap: 8 },
  groupTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 4 },
  choiceCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16, paddingVertical: 12 },
  choiceEmoji: { fontSize: 24, width: 32 },
  choiceName: { flex: 1, fontSize: 17 },
  categoryTypes: { flexDirection: 'row', gap: 8 },
  categoryType: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  categoryFormCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  compactFormRow: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16 },
  inlineInput: { borderColor: 'transparent', flex: 1, paddingHorizontal: 0, textAlign: 'right' },
  typeRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: 16 },
  categoryTrailingValue: { alignItems: 'flex-end', flex: 1, justifyContent: 'center', minHeight: 36 },
  categoryTrailingText: { textAlign: 'right' },
  categoryCountLabel: { flex: 1 },
  categorySettingRow: { alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 58, paddingHorizontal: 16 },
  emojiPreview: { flex: 1, fontSize: 24, textAlign: 'right' },
  deleteAction: { alignItems: 'center', borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 52 },
  confirmOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 24 },
  confirmCard: { borderRadius: 18, borderWidth: 1, gap: 16, maxWidth: 440, padding: 24, width: '100%' },
  confirmTitle: { fontSize: 22, fontWeight: '700' },
  confirmDeleteButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  cancelDeleteButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
