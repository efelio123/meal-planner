import { useSignIn, useSignUp } from '@clerk/expo';
import { type Href, Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';

type Mode = 'sign-in' | 'sign-up';

function messageFor(error: unknown, fallback: string) {
  if (
    error
    && typeof error === 'object'
    && 'longMessage' in error
    && typeof error.longMessage === 'string'
    && error.longMessage.trim()
  ) {
    return error.longMessage.trim();
  }
  return fallback;
}

export function AuthEmailCodeForm({ mode }: { mode: Mode }) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const emailAddress = email.trim();
    if (!emailAddress) { setError('Enter your email address.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'sign-in') {
        if (!codeSent) {
          const creation = await signIn.create({ identifier: emailAddress });
          if (creation.error) {
            setError(messageFor(creation.error, 'We could not start sign-in. Check your email address and try again.'));
            return;
          }
        }
        const result = await signIn.emailCode.sendCode();
        if (result.error) { setError(messageFor(result.error, 'We could not send a verification code. Please try again.')); return; }
      } else if (!codeSent) {
        const result = await signUp.create({ emailAddress });
        if (result.error) { setError(messageFor(result.error, 'We could not start sign-up. Check your email address and try again.')); return; }
        const sendResult = await signUp.verifications.sendEmailCode();
        if (sendResult.error) { setError(messageFor(sendResult.error, 'We could not send a verification code. Please try again.')); return; }
      } else {
        const sendResult = await signUp.verifications.sendEmailCode();
        if (sendResult.error) { setError(messageFor(sendResult.error, 'We could not send a verification code. Please try again.')); return; }
      }
      setCodeSent(true);
      setResendSeconds(30);
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (resendSeconds === 0) return;
    const timer = setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const verifyCode = async () => {
    if (!code.trim()) { setError('Enter the verification code.'); return; }
    setBusy(true);
    setError(null);
    try {
      const verification = mode === 'sign-in'
        ? await signIn.emailCode.verifyCode({ code: code.trim() })
        : await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (verification.error) { setError(messageFor(verification.error, 'We could not verify that code. Please try again.')); return; }
      const finalization = mode === 'sign-in' ? await signIn.finalize() : await signUp.finalize();
      if (finalization.error) { setError(messageFor(finalization.error, 'We could not complete sign-in. Please try again.')); return; }
      router.replace('/');
    } finally { setBusy(false); }
  };

  const alternate = mode === 'sign-in' ? '/(auth)/sign-up' : '/(auth)/sign-in';
  const alternateText = mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in';
  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.description}>We’ll send a verification code to your email. No password needed.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!codeSent ? <>
          <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" style={styles.input} value={email} />
          <Button disabled={busy} onPress={() => void sendCode()} title={busy ? 'Sending…' : 'Send code'} />
        </> : <>
          <TextInput accessibilityLabel="Verification code" autoComplete="one-time-code" keyboardType="number-pad" onChangeText={setCode} placeholder="Verification code" style={styles.input} value={code} />
          <Button disabled={busy} onPress={() => void verifyCode()} title={busy ? 'Verifying…' : 'Verify and continue'} />
          <Button disabled={busy || resendSeconds > 0} onPress={() => void sendCode()} title={resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'} />
        </>}
        <Link href={alternate as Href}>{alternateText}</Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  description: { fontSize: 16, lineHeight: 22 },
  error: { color: '#b42318', fontSize: 15 },
  input: { borderColor: '#9ca3af', borderRadius: 8, borderWidth: 1, fontSize: 16, padding: 12 },
});
