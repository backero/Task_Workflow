import React from 'react';
import { motion } from 'framer-motion';
import { Typography } from 'antd';
import backeroLeaf from '../../assets/backero-leaf.png';
import { brand } from '../../theme/workflowTheme';

const { Title, Text } = Typography;

const FEATURES = ['Tasks & approvals', 'CRM & sales pipeline', 'Inventory & production', 'Finance & reporting'];

export default function AuthLayout({ children, maxWidth = 400 }) {
  return (
    <div className="min-h-screen flex">
      {/* ── Left layer — brand panel ── */}
      <div
        className="hidden lg:flex lg:w-[44%] relative flex-col items-center justify-center overflow-hidden"
        style={{ background: brand.chrome }}
      >
        <div
          style={{
            position: 'absolute', top: -60, left: -40, width: 320, height: 320, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(102,156,44,0.22) 0%, transparent 70%)', pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: -80, right: -60, width: 360, height: 360, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(144,205,79,0.14) 0%, transparent 70%)', pointerEvents: 'none',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex flex-col items-center text-center px-10"
        >
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 p-4"
            style={{ background: '#fff', boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}
          >
            <img src={backeroLeaf} alt="Backero" className="w-full h-full object-contain" />
          </div>
          <Title level={2} style={{ color: '#fff', marginBottom: 4 }}>Backero</Title>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15 }}>
            Enterprise Operations Platform
          </Text>

          <div className="mt-10 space-y-3 text-left w-full max-w-xs">
            {FEATURES.map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#90cd4f' }} />
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>{item}</Text>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Right layer — form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: brand.page }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
          style={{ maxWidth }}
        >
          {/* Mobile-only logo (left panel is hidden below lg) */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 p-2.5"
              style={{ background: '#fff', boxShadow: '0 4px 16px rgba(15,23,42,0.12)' }}
            >
              <img src={backeroLeaf} alt="Backero" className="w-full h-full object-contain" />
            </div>
            <Title level={3} style={{ marginBottom: 0 }}>Backero</Title>
          </div>

          {children}

          <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12, marginTop: 24 }}>
            Secured by Backero Enterprise Security
          </Text>
        </motion.div>
      </div>
    </div>
  );
}
