import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api, ApiError } from '@/lib/api';
import { permissionActions, type MemberPermissions, type PermissionAction } from '@/lib/household-permissions';
import { MemberPermissionsScreen } from './member-permissions-screen';
const mockToken = jest.fn().mockResolvedValue('token'); const mockRefreshAccess = jest.fn();
let mockRole = 'owner'; let mockParams = { householdId: 'target-home', membershipId: 'target-member' };
const mockGuard = jest.fn();
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: 'owner-user', sessionId: 'session' }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/hooks/use-unsaved-changes-guard', () => ({ useUnsavedChangesGuard: (options: unknown) => { mockGuard(options); return { confirmation: null }; } }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ getToken: mockToken, refreshAccess: mockRefreshAccess,
  selectedHousehold: { id: 'selected-home', name: 'Selected', role: 'owner' },
  households: [{ id: 'target-home', name: 'Target', role: mockRole }, { id: 'other-home', name: 'Other', role: mockRole }],
}) }));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), api: { memberPermissions: jest.fn(), setMemberPermissions: jest.fn(), householdMember: jest.fn() } }));
jest.mock('expo-symbols', () => { const React = jest.requireActual('react'); const { View } = jest.requireActual('react-native'); return { SymbolView: (props: object) => React.createElement(View, props) }; });
const mocked = jest.mocked(api);
const actions = permissionActions.map((key) => ({ key, label: key, group: key.startsWith('catalog.') ? key.split('.')[1] : key.startsWith('shopping.') ? 'Shopping' : key.startsWith('recipes.') ? 'Recipes' : 'Meal planning' }));
function snapshot(grants: readonly PermissionAction[] = permissionActions, revision = 1): MemberPermissions { return { membership_id: 'target-member', role: 'member', permissions: [...grants], permissions_revision: revision, actions }; }
beforeEach(() => {
  jest.clearAllMocks(); mockRole = 'owner'; mockParams = { householdId: 'target-home', membershipId: 'target-member' };
  mocked.memberPermissions.mockResolvedValue(snapshot()); mocked.householdMember.mockResolvedValue({ member: { membership_id: 'target-member', display_name: 'Sam', role: 'member' } as never });
  mocked.setMemberPermissions.mockImplementation(async (_token, _home, _member, grants) => snapshot(grants, 2));
});
it('toggles a whole section locally, keeps other sections and saves the explicit target membership once', async () => {
  await render(<MemberPermissionsScreen />); const shopping = await screen.findByRole('checkbox', { name: 'All Shopping actions' });
  expect(shopping).toBeChecked(); expect(mocked.setMemberPermissions).not.toHaveBeenCalled();
  await fireEvent.press(shopping);
  expect(screen.getByRole('checkbox', { name: 'shopping.add' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'All Recipes actions' })).toBeChecked();
  expect(mocked.setMemberPermissions).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Permissions saved.');
  expect(mocked.setMemberPermissions).toHaveBeenCalledWith(expect.any(Function), 'target-home', 'target-member', permissionActions.filter((key) => !key.startsWith('shopping.')), 1);
  expect(mockRefreshAccess).toHaveBeenCalledWith('target-home');
});
it('shows mixed state from individual rows and selects all when the mixed heading is tapped', async () => {
  mocked.memberPermissions.mockResolvedValue(snapshot(['shopping.add', 'recipes.create']));
  await render(<MemberPermissionsScreen />); const shopping = await screen.findByRole('checkbox', { name: 'All Shopping actions' });
  expect(shopping.props.accessibilityState.checked).toBe('mixed');
  await fireEvent.press(shopping); expect(screen.getByRole('checkbox', { name: 'All Shopping actions' })).toBeChecked();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'shopping.edit' }));
  expect(screen.getByRole('checkbox', { name: 'All Shopping actions' }).props.accessibilityState.checked).toBe('mixed');
  expect(screen.getByRole('checkbox', { name: 'All Recipes actions' }).props.accessibilityState.checked).toBe('mixed');
  expect(mockGuard).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true, subject: 'permissions' }));
});
it('Catalog master includes all 12 descendants without changing Shopping', async () => {
  mocked.memberPermissions.mockResolvedValue(snapshot(['shopping.add']));
  await render(<MemberPermissionsScreen />); await fireEvent.press(await screen.findByRole('checkbox', { name: 'All Catalog actions' }));
  for (const key of permissionActions.filter((action) => action.startsWith('catalog.'))) expect(screen.getByRole('checkbox', { name: key })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'shopping.add' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'shopping.check' })).not.toBeChecked();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'catalog.categories.edit' }));
  expect(screen.getByRole('checkbox', { name: 'All Catalog actions' }).props.accessibilityState.checked).toBe('mixed');
});
it('owner targets have read-only full access and no save action', async () => {
  mocked.memberPermissions.mockResolvedValue({ ...snapshot(), role: 'owner' });
  await render(<MemberPermissionsScreen />); await screen.findByText('Owners have full access.');
  expect(screen.getByRole('checkbox', { name: 'All Shopping actions' })).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});
it('a member cannot load the owner-only permission editor', async () => {
  mockRole = 'member'; await render(<MemberPermissionsScreen />);
  expect(screen.getByText('Only owners can manage household permissions.')).toBeTruthy(); expect(mocked.memberPermissions).not.toHaveBeenCalled();
});
it('retains changed checkboxes after conflict and reloads only on explicit request', async () => {
  mocked.setMemberPermissions.mockRejectedValueOnce(new ApiError(409, 'Changed elsewhere', 'MEMBER_PERMISSIONS_CONFLICT'));
  await render(<MemberPermissionsScreen />); await fireEvent.press(await screen.findByRole('checkbox', { name: 'All Shopping actions' })); await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Changed elsewhere'); expect(screen.getByRole('checkbox', { name: 'shopping.add' })).not.toBeChecked();
  expect(mocked.memberPermissions).toHaveBeenCalledTimes(1);
  mocked.memberPermissions.mockResolvedValue(snapshot(['recipes.create'], 3));
  await fireEvent.press(screen.getByRole('button', { name: 'Reload latest permissions' }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'recipes.create' })).toBeChecked());
  expect(screen.getByRole('checkbox', { name: 'recipes.edit' })).not.toBeChecked();
});
it('checks an uncertain save before retrying, without repeating the PATCH', async () => {
  mocked.setMemberPermissions.mockRejectedValueOnce(new Error('offline'));
  await render(<MemberPermissionsScreen />); await fireEvent.press(await screen.findByRole('checkbox', { name: 'All Shopping actions' })); await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Check saved permissions' });
  mocked.memberPermissions.mockResolvedValue(snapshot(permissionActions.filter((key) => !key.startsWith('shopping.')), 2));
  await fireEvent.press(screen.getByRole('button', { name: 'Check saved permissions' }));
  await screen.findByText('Permissions saved.'); expect(mocked.setMemberPermissions).toHaveBeenCalledTimes(1);
});
it('ignores an old target response after a household change', async () => {
  let resolve!: (value: MemberPermissions) => void; const pending = new Promise<MemberPermissions>((done) => { resolve = done; });
  mocked.memberPermissions.mockReturnValueOnce(pending);
  const rendered = await render(<MemberPermissionsScreen />);
  await waitFor(() => expect(mocked.memberPermissions).toHaveBeenCalledTimes(1));
  mockParams = { householdId: 'other-home', membershipId: 'other-member' };
  mocked.memberPermissions.mockResolvedValue({ ...snapshot(['recipes.create']), membership_id: 'other-member' });
  await rendered.rerender(<MemberPermissionsScreen />); await screen.findByRole('checkbox', { name: 'recipes.create' });
  await act(async () => resolve(snapshot()));
  expect(screen.getByRole('checkbox', { name: 'shopping.add' })).not.toBeChecked();
});
