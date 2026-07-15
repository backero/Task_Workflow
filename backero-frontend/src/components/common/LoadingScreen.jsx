import React from 'react';
import companyLogo from '../../assets/Backero.png';

export default function LoadingScreen({ fadingOut }) {
  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-white transition-opacity duration-500 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <img
        src={companyLogo}
        alt="Backero"
        className="w-56 sm:w-64 animate-scale-in"
      />
      <div className="w-40 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.08)' }}>
        <div className="h-full w-1/3 rounded-full animate-loading-bar" style={{ background: 'var(--grad-brand)' }} />
      </div>
    </div>
  );
}
