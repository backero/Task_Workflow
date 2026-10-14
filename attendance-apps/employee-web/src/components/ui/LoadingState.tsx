import {Space, Spin, Typography} from 'antd';
import type React from 'react';

export default function LoadingState({label = 'Loading…'}: {label?: string}): React.JSX.Element {
  return (
    <Space align="center" style={{width: '100%', justifyContent: 'center', padding: '24px 0'}}>
      <Spin />
      <Typography.Text type="secondary">{label}</Typography.Text>
    </Space>
  );
}
