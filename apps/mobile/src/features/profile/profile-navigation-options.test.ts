import { profileDetailHeader, profileNativeStackOptions } from './profile-navigation-options';

describe('native Profile detail navigation options', () => {
  it.each(['My account', 'My households', 'Household details', 'Invitations'])('shows one titled native header for %s', (title) => {
    expect(profileDetailHeader(title)).toEqual({ headerShown: true, title });
    expect(profileNativeStackOptions).toEqual({ headerBackButtonDisplayMode: 'minimal' });
  });
});
