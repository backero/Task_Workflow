import React from 'react';
import { Modal, Typography } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';

const { Text } = Typography;

const COLOR_MAP = {
  red: '#dc2626',
  orange: '#ea580c',
  indigo: '#4f46e5',
};

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Yes, Delete', confirmColor = 'red', onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onOk={onConfirm}
      onCancel={onCancel}
      okText={confirmLabel}
      okButtonProps={{ style: { background: COLOR_MAP[confirmColor] || COLOR_MAP.red, borderColor: COLOR_MAP[confirmColor] || COLOR_MAP.red } }}
      centered
      width={380}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ExclamationCircleFilled style={{ color: '#dc2626', fontSize: 20 }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        </div>
      }
    >
      <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>{message}</Text>
    </Modal>
  );
}
