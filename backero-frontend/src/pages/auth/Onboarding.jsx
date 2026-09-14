import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, ClipboardList, Users, Package, Factory, DollarSign, BarChart3, ArrowRight } from 'lucide-react';
import { Button, Card, Col, Row, Typography } from 'antd';

const { Title, Text } = Typography;

const features = [
  { icon: ClipboardList, title: 'Task Management', desc: 'Assign, track, and approve tasks with strict accountability.' },
  { icon: Users, title: 'CRM & Sales', desc: 'Full lead pipeline with automated follow-up reminders.' },
  { icon: Package, title: 'Inventory Control', desc: 'Real-time stock tracking with low-stock alerts.' },
  { icon: Factory, title: 'Production Orders', desc: 'BOM management, quality control, and batch tracking.' },
  { icon: DollarSign, title: 'Finance & Invoicing', desc: 'Ledger, invoices, and GST-ready financial reporting.' },
  { icon: BarChart3, title: 'Department Dashboards', desc: 'Separate analytics and KPIs per department.' },
];

export default function Onboarding() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#fdf8ee,#faf5ff)', padding: 16 }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '100%', maxWidth: 640 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg,#7c5a17,#a8781f,#c2a35a)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 24px rgba(168,120,31,0.3)' }}>
            <CheckCircle2 size={40} color="#fff" />
          </div>
          <Title level={2} style={{ marginBottom: 4 }}>Welcome to Backero!</Title>
          <Text type="secondary">Your enterprise operations platform is ready.</Text>
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
          {features.map((f) => (
            <Col span={12} key={f.title}>
              <Card size="small" style={{ height: '100%' }}>
                <f.icon size={22} color="#a8781f" />
                <Title level={5} style={{ marginTop: 8, marginBottom: 4 }}>{f.title}</Title>
                <Text type="secondary" style={{ fontSize: 13 }}>{f.desc}</Text>
              </Card>
            </Col>
          ))}
        </Row>

        <div style={{ textAlign: 'center' }}>
          <Button type="primary" size="large" icon={<ArrowRight size={16} />} iconPosition="end" onClick={() => navigate('/')}>Go to Dashboard</Button>
        </div>
      </motion.div>
    </div>
  );
}
