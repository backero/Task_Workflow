import React from 'react';
import { Empty, Typography } from 'antd';

const { Title } = Typography;

export default function CalendarView() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Task Calendar</Title>
      <div style={{ background: '#fff', borderRadius: 8, padding: 60 }}>
        <Empty description="Calendar integration — coming soon" />
      </div>
    </div>
  );
}
