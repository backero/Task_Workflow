import {Button as AntButton} from 'antd';
import type {ButtonHTMLAttributes, MouseEventHandler} from 'react';
import type React from 'react';

import {primaryGradient} from '../../theme/palette';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'color'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: string | number;
  loading?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const ANT_TYPE: Record<ButtonVariant, 'primary' | 'default' | 'text'> = {
  primary: 'primary',
  secondary: 'default',
  destructive: 'primary',
  ghost: 'text',
};

const ANT_SIZE: Record<ButtonSize, 'small' | 'middle'> = {
  sm: 'small',
  md: 'middle',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  width,
  className,
  type = 'button',
  loading,
  disabled,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  const isGradient = variant === 'primary' && !disabled;

  return (
    <AntButton
      htmlType={type}
      type={ANT_TYPE[variant]}
      danger={variant === 'destructive'}
      size={ANT_SIZE[size]}
      loading={loading}
      disabled={disabled}
      className={isGradient ? `btn-gradient-primary ${className ?? ''}`.trim() : className}
      style={{
        ...(width ? {width} : undefined),
        ...(isGradient ? {background: primaryGradient, border: 'none'} : undefined),
      }}
      {...rest}
    >
      {children}
    </AntButton>
  );
}
