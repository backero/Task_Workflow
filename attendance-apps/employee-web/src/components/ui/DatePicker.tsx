import {DatePicker as AntDatePicker} from 'antd';
import dayjs from 'dayjs';
import type React from 'react';

const DATE_FORMAT = 'YYYY-MM-DD';

interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD), matching the API's wire format — callers
   * never touch dayjs directly. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  minDate?: string;
  maxDate?: string;
}

export default function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  allowClear,
  className,
  minDate,
  maxDate,
}: DatePickerProps): React.JSX.Element {
  return (
    <AntDatePicker
      className={className}
      style={{width: '100%'}}
      format={DATE_FORMAT}
      value={value ? dayjs(value, DATE_FORMAT) : null}
      onChange={next => onChange(next ? next.format(DATE_FORMAT) : '')}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear ?? true}
      minDate={minDate ? dayjs(minDate, DATE_FORMAT) : undefined}
      maxDate={maxDate ? dayjs(maxDate, DATE_FORMAT) : undefined}
    />
  );
}
