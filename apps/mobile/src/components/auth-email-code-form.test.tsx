import { createElement as mockCreateElement, type ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useSignIn, useSignUp } from '@clerk/expo';
import { Text as mockText } from 'react-native';

import { AuthEmailCodeForm } from '@/components/auth-email-code-form';

const mockRouterReplace = jest.fn();

jest.mock('@clerk/expo', () => ({ useSignIn: jest.fn(), useSignUp: jest.fn() }));
jest.mock('expo-router', () => {
  return {
    Link: ({ children }: { children: ReactNode }) => mockCreateElement(mockText, null, children),
    useRouter: () => ({ replace: mockRouterReplace }),
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
    mockedUseSignIn.mockReturnValue({
      signIn: { create, emailCode: { sendCode, verifyCode: jest.fn() }, finalize: jest.fn() },
    } as unknown as ReturnType<typeof useSignIn>);
    mockedUseSignUp.mockReturnValue({ signUp: {} } as ReturnType<typeof useSignUp>);
  });

  it('creates the sign-in attempt before sending an email code', async () => {
    const screen = await render(<AuthEmailCodeForm mode="sign-in" />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.test');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    });

    await waitFor(() => expect(sendCode).toHaveBeenCalledWith());
    expect(create).toHaveBeenCalledWith({ identifier: 'person@example.test' });
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(sendCode.mock.invocationCallOrder[0]);
  });

  it('shows Clerk’s safe longMessage and does not send a code after create fails', async () => {
    create.mockResolvedValue({ error: { longMessage: 'No account exists for that email address.' } });
    const screen = await render(<AuthEmailCodeForm mode="sign-in" />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email address'), 'person@example.test');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No account exists for that email address.'));
    expect(sendCode).not.toHaveBeenCalled();
  });
});
