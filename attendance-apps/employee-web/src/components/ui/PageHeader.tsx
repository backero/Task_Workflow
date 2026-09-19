import {Flex, Typography} from 'antd';
import type React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({title, description, actions}: PageHeaderProps): React.JSX.Element {
  return (
    <Flex wrap="wrap" align="flex-start" justify="space-between" gap={16} style={{marginBottom: 16}}>
      <div>
        <Typography.Title level={3} style={{margin: 0}}>
          {title}
        </Typography.Title>
        {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
      </div>
      {actions ?? null}
    </Flex>
  );
}
