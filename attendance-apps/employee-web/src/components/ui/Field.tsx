import {Typography} from 'antd';
import type React from 'react';

import {destructive, neutral, spacing, typography} from '../../theme/palette';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  className?: string;
  mb?: string | number;
  children: React.ReactNode;
}

/**
 * Vertical layout (label above, input below) — deliberately not built on
 * antd's Form.Item, which defaults to a horizontal label-beside-input
 * layout when used standalone (no ancestor <Form>).
 */
export default function Field({label, htmlFor, error, hint, className, mb, children}: FieldProps): React.JSX.Element {
  return (
    <div className={className} style={{marginBottom: mb ?? spacing.md}}>
      <label
        htmlFor={htmlFor}
        style={{
          display: 'block',
          marginBottom: 6,
          fontSize: 13,
          fontWeight: typography.weight.medium,
          color: neutral[700],
        }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <Typography.Text style={{display: 'block', marginTop: 4, fontSize: 12.5, color: destructive}}>
          {error}
        </Typography.Text>
      ) : hint ? (
        <Typography.Text type="secondary" style={{display: 'block', marginTop: 4, fontSize: 12.5}}>
          {hint}
        </Typography.Text>
      ) : null}
    </div>
  );
}
