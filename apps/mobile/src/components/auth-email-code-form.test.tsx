import { createSignInAndSendCode, messageFor } from '@/components/auth-email-code-form';

jest.mock('@clerk/expo', () => ({ useSignIn: jest.fn(), useSignUp: jest.fn() }));
jest.mock('expo-router', () => ({ Link: 'Link', useRouter: jest.fn() }));

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
