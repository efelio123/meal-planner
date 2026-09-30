import { useSignIn, useSignUp } from '@clerk/expo';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AuthEmailCodeForm, createSignInAndSendCode, createSignUpAndSendCode, messageFor } from '@/components/auth-email-code-form';
import { validateDisplayName } from '@/features/identity/display-name';

jest.mock('@clerk/expo', () => ({ useSignIn: jest.fn(), useSignUp: jest.fn() }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Link: ({ children }: { children: string }) => React.createElement(Text, null, children),
    useRouter: jest.fn(() => ({ replace: jest.fn() })),
  };
});

const mockedUseSignIn = jest.mocked(useSignIn);
const mockedUseSignUp = jest.mocked(useSignUp);

describe('AuthEmailCodeForm sign-in', () => {
  const create = jest.fn();
  const sendCode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({ error: null });
    sendCode.mockResolvedValue({ error: null });
  });

  it('creates the sign-in attempt before sending an email code', async () => {
    await createSignInAndSendCode(
      { create, emailCode: { sendCode } },
      'person@example.test',
    );

    expect(sendCode).toHaveBeenCalledWith();
    expect(create).toHaveBeenCalledWith({ identifier: 'person@example.test' });
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(sendCode.mock.invocationCallOrder[0]);
  });

  it('does not send a code after create fails and keeps Clerk’s safe longMessage', async () => {
    create.mockResolvedValue({ error: { longMessage: 'No account exists for that email address.' } });

    const operation = await createSignInAndSendCode(
      { create, emailCode: { sendCode } },
      'person@example.test',
    );

    expect(operation.source).toBe('creation');
    expect(sendCode).not.toHaveBeenCalled();
    expect(messageFor(
      operation.result.error,
      'We could not start sign-in. Check your email address and try again.',
    )).toBe('No account exists for that email address.');
  });
});

describe('display-name signup', () => {
  it('requires and submits the display-name field before sending the signup code', async () => {
    const create = jest.fn().mockResolvedValue({ error: null });
    const sendEmailCode = jest.fn().mockResolvedValue({ error: null });
    mockedUseSignIn.mockReturnValue({ signIn: {} } as unknown as ReturnType<typeof useSignIn>);
    mockedUseSignUp.mockReturnValue({ signUp: { create, verifications: { sendEmailCode } } } as unknown as ReturnType<typeof useSignUp>);
    await render(<AuthEmailCodeForm mode="sign-up" />);

    expect(screen.getByLabelText('Display name')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.test');
    await fireEvent.changeText(screen.getByLabelText('Display name'), '  Ada Lovelace  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));

    expect(create).toHaveBeenCalledWith({ emailAddress: 'person@example.test', firstName: 'Ada Lovelace' });
    expect(sendEmailCode).toHaveBeenCalledTimes(1);
  });

  it('sends the required normalized display name to Clerk as firstName before email verification', async () => {
    const create = jest.fn().mockResolvedValue({ error: null });
    const sendEmailCode = jest.fn().mockResolvedValue({ error: null });
    const operation = await createSignUpAndSendCode(
      { create, verifications: { sendEmailCode } },
      'person@example.test',
      'Ada Lovelace',
    );

    expect(operation.source).toBe('send');
    expect(create).toHaveBeenCalledWith({ emailAddress: 'person@example.test', firstName: 'Ada Lovelace' });
    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(sendEmailCode.mock.invocationCallOrder[0]);
  });

  it.each([
    ['', 'Enter a display name.'],
    ['   ', 'Enter a display name.'],
    ['x'.repeat(81), 'Use 80 characters or fewer.'],
    ['Name\u0000hidden', 'Display names can’t contain control characters.'],
  ])('rejects an invalid display name %j', (name, error) => {
    expect(validateDisplayName(name)).toEqual({ value: null, error });
  });

  it('trims Unicode display names and counts Unicode code points', () => {
    expect(validateDisplayName(`  ${'😀'.repeat(80)}  `)).toEqual({ value: '😀'.repeat(80), error: null });
  });
});
