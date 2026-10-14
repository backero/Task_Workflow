import {Empty, Typography} from 'antd';
import type React from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  className?: string;
}

export default function EmptyState({title, description, className}: EmptyStateProps): React.JSX.Element {
  return (
    <Empty
      className={className}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <>
          <Typography.Text strong>{title}</Typography.Text>
          {description ? (
            <div>
              <Typography.Text type="secondary">{description}</Typography.Text>
            </div>
          ) : null}
        </>
      }
      style={{padding: '24px 16px'}}
    />
  );
}
