import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View} from 'react-native';

import {ApiError} from '../api/client';
import {useAuth} from '../auth/useAuth';
import GradientButton from '../components/ui/GradientButton';
import Logo from '../components/Logo';
import {Snackbar} from '../components/snackbar';
import {destructive, neutral, primary, radius, spacing, surface, text as textColor, typography} from '../theme/palette';

export default function LoginScreen(): React.JSX.Element {
  const {login} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      Snackbar.show({
        text: 'Signed in successfully.',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: primary.active,
        textColor: surface,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Logo width={220} style={styles.logo} />
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={neutral[400]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={neutral[400]}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GradientButton
          title="Sign In"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!email || !password}
          style={styles.button}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: surface},
  content: {flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl},
  logo: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
    fontSize: typography.scale.body.size,
    color: textColor.secondary,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: neutral[200],
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.scale.body.size,
    color: textColor.primary,
    marginBottom: spacing.md,
  },
  error: {
    color: destructive,
    fontSize: typography.scale.caption.size,
    marginBottom: spacing.md,
  },
  button: {
    marginTop: spacing.sm,
  },
});
