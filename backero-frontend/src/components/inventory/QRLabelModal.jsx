import React, { useRef } from 'react';
import QRCode from 'react-qr-code';
import { XMarkIcon, PrinterIcon, QrCodeIcon } from '@heroicons/react/24/outline';

function SingleLabel({ product }) {
  return (
    <div className="label-card flex flex-col items-center border-2 border-gray-300 rounded-xl p-4 w-44 bg-white">
      <QRCode
        value={`backero:inv:${product._id}`}
        size={128}
        level="M"
        style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
      />
      <div className="mt-2 text-center">
        <p className="font-bold text-xs text-gray-900 leading-tight line-clamp-2">{product.name}</p>
        <p className="font-mono text-[10px] text-gray-500 mt-0.5">{product.sku}</p>
        {product.currentStock !== undefined && (
          <p className="text-[10px] text-gray-400 mt-0.5">Stock: {product.currentStock} {product.unit}</p>
        )}
      </div>
    </div>
  );
}

export default function QRLabelModal({ products, onClose }) {
  const printRef = useRef();

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>QR Labels — Backero</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#fff;padding:20px}
  .grid{display:flex;flex-wrap:wrap;gap:16px}
  .card{display:flex;flex-direction:column;align-items:center;border:2px solid #d1d5db;border-radius:12px;padding:16px;width:176px;background:#fff}
  .card svg{width:128px;height:128px}
  .name{font-weight:700;font-size:11px;color:#111;text-align:center;margin-top:8px;line-height:1.3}
  .sku{font-family:monospace;font-size:9px;color:#6b7280;margin-top:2px;text-align:center}
  .stock{font-size:9px;color:#9ca3af;margin-top:2px;text-align:center}
  @media print{body{padding:8px}.grid{gap:12px}}
</style></head>
<body>
<div class="grid">
${products.map(p => `
  <div class="card">
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <!-- QR placeholder - actual QR rendered by react-qr-code and copied -->
    </svg>
    <p class="name">${p.name}</p>
    <p class="sku">${p.sku}</p>
    ${p.currentStock !== undefined ? `<p class="stock">Stock: ${p.currentStock} ${p.unit || ''}</p>` : ''}
  </div>`).join('')}
</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
</body></html>`);
    win.document.close();

    // Better: print the actual DOM
    const content = printRef.current;
    if (content) {
      const printWin = window.open('', '_blank');
      printWin.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>QR Labels</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#fff;padding:20px}
  .grid{display:flex;flex-wrap:wrap;gap:16px}
  .label-card{display:flex;flex-direction:column;align-items:center;border:2px solid #d1d5db;border-radius:12px;padding:16px;width:176px;background:#fff}
  p{font-size:11px;color:#111;text-align:center;margin-top:6px;line-height:1.3;font-weight:700}
  .sku{font-family:monospace;font-size:9px;color:#6b7280;font-weight:400}
  .stk{font-size:9px;color:#9ca3af;font-weight:400}
  @media print{body{padding:8px}.grid{gap:12px}}
</style></head>
<body><div class="grid">${content.innerHTML}</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
</body></html>`);
      win.close();
      printWin.document.close();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#070c17] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1b2e4a]">
          <div className="flex items-center gap-2">
            <QrCodeIcon className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-gray-900 dark:text-white">QR Labels — {products.length} product{products.length !== 1 ? 's' : ''}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="btn-primary gap-2 text-sm">
              <PrinterIcon className="w-4 h-4" /> Print Labels
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Labels grid */}
        <div className="p-6 max-h-[70vh] overflow-y-auto bg-gray-100 dark:bg-[#0a1628]">
          <div ref={printRef} className="flex flex-wrap gap-4 justify-center">
            {products.map(p => <SingleLabel key={p._id} product={p} />)}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 py-3 border-t border-gray-100 dark:border-[#1b2e4a]">
          Scan these QR codes in Backero to instantly update stock
        </p>
      </div>
    </div>
  );
}
