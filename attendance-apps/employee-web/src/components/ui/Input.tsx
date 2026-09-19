import {Input as AntInput} from 'antd';
import type {InputRef} from 'antd';
import {forwardRef} from 'react';
import type {InputHTMLAttributes} from 'react';

const Input = forwardRef<InputRef, Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>>(
  function Input({className, ...rest}, ref) {
    return <AntInput ref={ref} className={className} {...rest} />;
  },
);

export default Input;
