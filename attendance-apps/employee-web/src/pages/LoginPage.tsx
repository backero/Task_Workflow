import {zodResolver} from '@hookform/resolvers/zod';
import {CalendarOutlined, ClockCircleOutlined, HistoryOutlined} from '@ant-design/icons';
import {Flex, Typography} from 'antd';
import {useState} from 'react';
import type React from 'react';
import {Controller, useForm} from 'react-hook-form';
import {Navigate} from 'react-router-dom';
import {z} from 'zod';

import {ApiError} from '../api/httpClient';
import {useAuth} from '../auth/useAuth';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Input from '../components/ui/Input';
import {neutral, primary, surface} from '../theme/palette';

const FEATURES = [
  {icon: ClockCircleOutlined, title: "Today's status", description: 'See your check-in and check-out the moment they\'re recorded.'},
  {icon: HistoryOutlined, title: 'Attendance history', description: 'Look back over any date range, any time.'},
  {icon: CalendarOutlined, title: 'Always up to date', description: 'Your record, straight from Backero — no spreadsheets.'},
] as const;

const loginSchema = z.object({
  email: z.email('Enter a valid email').min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage(): React.JSX.Element {
  const {isAuthenticated, login} = useAuth();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
  } = useForm<LoginFormValues>({resolver: zodResolver(loginSchema), defaultValues: {email: '', password: ''}});

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = handleSubmit(async values => {
    setError(null);
    try {
      await login(values.email.trim(), values.password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    }
  });

  return (
    <Flex style={{minHeight: '100vh'}}>
      <div
        style={{
          flex: 1,
          display: 'none',
          position: 'relative',
          overflow: 'hidden',
          background: primary.active,
          color: surface,
          padding: 32,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
        className="login-hero"
      >
        {/* Decorative watermark — purely visual, sits behind the content. */}
        <img
          src="/logo-leaf.png"
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -80,
            right: -80,
            width: 420,
            height: 420,
            opacity: 0.08,
            filter: 'brightness(0) invert(1)',
            pointerEvents: 'none',
          }}
        />

        <div style={{maxWidth: 440, alignSelf: 'center', width: '100%', position: 'relative'}}>
          <img src="/logo-white.png" alt="Backero" style={{height: 32, objectFit: 'contain'}} />

          <Typography.Title level={1} style={{marginTop: 32, color: surface, letterSpacing: '-0.02em'}}>
            Your attendance, always in view.
          </Typography.Title>
          <Typography.Text style={{display: 'block', margin: '16px 0 32px', color: neutral[200], fontSize: 15, lineHeight: 1.6}}>
            Check today's status, review your punch history, and keep your profile details in one place.
          </Typography.Text>

          {FEATURES.map(feature => (
            <Flex key={feature.title} align="center" gap={16} style={{marginBottom: 24}}>
              <Flex
                align="center"
                justify="center"
                style={{width: 38, height: 38, flexShrink: 0, borderRadius: 8, background: 'rgba(255,255,255,0.08)'}}
              >
                <feature.icon style={{fontSize: 18, color: surface}} />
              </Flex>
              <div>
                <Typography.Text strong style={{display: 'block', color: surface}}>
                  {feature.title}
                </Typography.Text>
                <Typography.Text style={{color: neutral[200], fontSize: 12.5}}>{feature.description}</Typography.Text>
              </div>
            </Flex>
          ))}

          <Typography.Text style={{color: neutral[200], fontSize: 12}}>
            Backero — Employee Attendance Platform
          </Typography.Text>
        </div>
      </div>

      <Flex align="center" justify="center" style={{flex: 1, background: surface, padding: '32px 24px'}}>
        <div style={{width: '100%', maxWidth: 380}}>
          <img src="/logo.png" alt="Backero" style={{height: 28, objectFit: 'contain', marginBottom: 24}} />

          <Typography.Title level={2} style={{margin: 0}}>
            Welcome back
          </Typography.Title>
          <Typography.Text type="secondary">Sign in to view your attendance and profile.</Typography.Text>

          <form onSubmit={onSubmit} style={{marginTop: 24}}>
            <Controller
              name="email"
              control={control}
              render={({field}) => (
                <Field label="Email" error={errors.email?.message}>
                  <Input {...field} type="email" autoComplete="username" />
                </Field>
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({field}) => (
                <Field label="Password" error={errors.password?.message}>
                  <Input {...field} type="password" autoComplete="current-password" />
                </Field>
              )}
            />

            {error ? (
              <Typography.Text type="danger" role="alert" style={{display: 'block', marginBottom: 16}}>
                {error}
              </Typography.Text>
            ) : null}

            <Button type="submit" width="100%" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>
      </Flex>
    </Flex>
  );
}
