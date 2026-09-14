import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Spin, Statistic, Tag, Typography } from 'antd';
import workflowApi from '../../api/workflowApi';
import { PRIORITY_COLOR, STATUS_COLOR } from './taskConstants';

const { Title, Text } = Typography;

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['workflow-tasks', 'analytics'],
    queryFn: () => workflowApi.get('/workflow/tasks/analytics').then((r) => r.data),
  });

  if (isLoading || !data) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={4}>Task Analytics</Title>

      <Row gutter={12} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Card>
            <Statistic title="Total tasks" value={data.total} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Overdue" value={data.overdue} valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={12}>
        <Col span={12}>
          <Card title="By status">
            {Object.entries(data.by_status).map(([status, count]) => (
              <div
                key={status}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
              >
                <Tag color={STATUS_COLOR[status] || 'default'}>{status}</Tag>
                <Text strong>{count}</Text>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="By priority">
            {Object.entries(data.by_priority).map(([priority, count]) => (
              <div
                key={priority}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
              >
                <Tag color={PRIORITY_COLOR[priority]}>{priority}</Tag>
                <Text strong>{count}</Text>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
