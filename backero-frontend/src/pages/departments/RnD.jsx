import React from 'react';
import { Typography } from 'antd';
import ProductionSnapshot from '../dashboard/ProductionSnapshot';

const { Title, Text } = Typography;

// The Production department's page — just the Sample Production stat boxes plus a live
// "who's doing what today" roster, not the entire Sample Production / Batch Tracker page
// (that's still at /samples for the actual day-to-day work).
export default function RnDDept() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 0 }}>Production Department</Title>
        <Text type="secondary">Live snapshot from Sample Production</Text>
      </div>
      <ProductionSnapshot department="Production" />
    </div>
  );
}
