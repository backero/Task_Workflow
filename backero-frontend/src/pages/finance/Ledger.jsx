import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../../api/axios';
import { format } from 'date-fns';
import { useForm, Controller } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Button, Card, Col, DatePicker, Drawer, Empty, Input, InputNumber, Radio, Row, Segmented, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const INCOME_CATEGORIES = ['Sales', 'Invoice Payment', 'Marketplace Revenue', 'Other Income'];
const EXPENSE_CATEGORIES = ['Salary', 'Raw Material', 'Rent', 'Utilities', 'Marketing', 'Logistics', 'Vendor Payment', 'Other Expense'];
const PAYMENT_METHODS = ['bank_transfer', 'upi', 'cash', 'cheque', 'card'];

function TransactionDrawer({ open, onClose, onSuccess }) {
  const { control, register, handleSubmit, watch, reset } = useForm({
    defaultValues: { type: 'income', date: dayjs(), paymentMethod: 'bank_transfer' },
  });
  const type = watch('type');

  const mutation = useMutation({
    mutationFn: (data) => api.post('/finance/transactions', { ...data, date: data.date?.toISOString() }),
    onSuccess: () => {
      toast.success('Transaction recorded');
      reset({ type: 'income', date: dayjs(), paymentMethod: 'bank_transfer' });
      onSuccess();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  return (
    <Drawer
      title="Record Transaction"
      open={open}
      onClose={onClose}
      width={420}
      footer={
        <Space style={{ width: '100%' }}>
          <Button onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} onClick={handleSubmit((data) => mutation.mutate(data))}>Record</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Controller
          name="type" control={control}
          render={({ field }) => (
            <Segmented
              block {...field}
              options={[
                { label: 'Income', value: 'income' },
                { label: 'Expense', value: 'expense' },
              ]}
            />
          )}
        />

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Category</Text>
          <Controller
            name="category" control={control} rules={{ required: true }}
            render={({ field }) => (
              <Select {...field} style={{ width: '100%' }} options={(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => ({ label: c, value: c }))} />
            )}
          />
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Amount (₹) *</Text>
          <Controller
            name="amount" control={control} rules={{ required: true }}
            render={({ field }) => <InputNumber {...field} style={{ width: '100%' }} min={0} step={0.01} />}
          />
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Description *</Text>
          <Input {...register('description', { required: true })} placeholder="Payment description..." />
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Date</Text>
          <Controller
            name="date" control={control}
            render={({ field }) => <DatePicker {...field} style={{ width: '100%' }} format="DD-MM-YYYY" />}
          />
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Payment Method</Text>
          <Controller
            name="paymentMethod" control={control}
            render={({ field }) => (
              <Select {...field} style={{ width: '100%' }} options={PAYMENT_METHODS.map((m) => ({ label: m.replace('_', ' '), value: m }))} />
            )}
          />
        </div>
      </Space>
    </Drawer>
  );
}

export default function Ledger() {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('');
  const qc = useQueryClient();

  const { data: summaryData } = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () => api.get('/finance/summary?period=month').then((r) => r.data.summary),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'transactions', type],
    queryFn: () => api.get('/finance/transactions', { params: { limit: 50, type: type || undefined } }).then((r) => r.data),
  });

  const transactions = data?.data || [];
  const netProfit = summaryData?.netProfit || 0;

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', render: (d) => <Text type="secondary">{format(new Date(d), 'dd MMM yy')}</Text> },
    {
      title: 'Description', dataIndex: 'description', key: 'description',
      render: (desc, tx) => (
        <div>
          <Text strong>{desc}</Text>
          {tx.reference && <div><Text type="secondary" style={{ fontSize: 12 }}>Ref: {tx.reference}</Text></div>}
        </div>
      ),
    },
    { title: 'Category', dataIndex: 'category', key: 'category', render: (c) => <Text type="secondary">{c}</Text> },
    { title: 'Method', dataIndex: 'paymentMethod', key: 'paymentMethod', align: 'center', render: (m) => <Tag>{m?.replace('_', ' ')}</Tag> },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right',
      render: (amount, tx) => (
        <Text strong style={{ color: tx.type === 'income' ? '#389e0d' : '#cf1322' }}>
          {tx.type === 'income' ? '+' : '-'}₹{amount.toLocaleString('en-IN')}
        </Text>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 0 }}>Financial Ledger</Title>
        <Button type="primary" icon={<Plus size={16} />} onClick={() => setShowForm(true)}>Record Transaction</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card style={{ borderTop: '3px solid #22c55e' }}>
            <ArrowUp size={18} color="#22c55e" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: '#389e0d' }}>₹{(summaryData?.totalIncome || 0).toLocaleString('en-IN')}</div>
            <Text type="secondary" style={{ fontSize: 13 }}>Income (This Month)</Text>
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderTop: '3px solid #ef4444' }}>
            <ArrowDown size={18} color="#ef4444" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: '#cf1322' }}>₹{(summaryData?.totalExpense || 0).toLocaleString('en-IN')}</div>
            <Text type="secondary" style={{ fontSize: 13 }}>Expense (This Month)</Text>
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderTop: `3px solid ${netProfit >= 0 ? '#669c2c' : '#ef4444'}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: netProfit >= 0 ? '#669c2c' : '#cf1322' }}>₹{Math.abs(netProfit).toLocaleString('en-IN')}</div>
            <Text type="secondary" style={{ fontSize: 13 }}>Net {netProfit >= 0 ? 'Profit' : 'Loss'} (This Month)</Text>
          </Card>
        </Col>
      </Row>

      <Radio.Group value={type} onChange={(e) => setType(e.target.value)} style={{ marginBottom: 16 }}>
        <Radio.Button value="">All</Radio.Button>
        <Radio.Button value="income">Income</Radio.Button>
        <Radio.Button value="expense">Expense</Radio.Button>
      </Radio.Group>

      <Card styles={{ body: { padding: 0 } }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: 40 }}><Empty description="No transactions found" /></div>
        ) : (
          <Table rowKey="_id" columns={columns} dataSource={transactions} pagination={false} />
        )}
      </Card>

      <TransactionDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['finance'] }); }}
      />
    </div>
  );
}
