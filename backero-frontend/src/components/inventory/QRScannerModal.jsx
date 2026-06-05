import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { XMarkIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const CAMERA_ID = 'qr-scanner-region';

export default function QRScannerModal({ onClose, onSuccess }) {
  const [scanning, setScanning] = useState(true);
  const [product, setProduct] = useState(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [movType, setMovType] = useState('IN');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const scannerRef = useRef(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(CAMERA_ID);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (isProcessingRef.current) return;
        if (!decodedText.startsWith('backero:inv:')) return;
        isProcessingRef.current = true;
        const productId = decodedText.replace('backero:inv:', '');
        handleScanned(productId, scanner);
      },
      () => {}
    ).catch((err) => {
      console.error('Camera start error:', err);
      toast.error('Could not access camera. Please allow camera permission.');
    });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  const handleScanned = async (productId, scanner) => {
    setScanning(false);
    setLoadingProduct(true);
    try {
      await scanner.stop();
    } catch {}

    try {
      const res = await api.get(`/inventory/products/${productId}`);
      setProduct(res.data.data);
      setQty('');
      setNotes('');
      setMovType('IN');
    } catch {
      toast.error('Product not found or access denied');
      resetScanner();
    } finally {
      setLoadingProduct(false);
    }
  };

  const resetScanner = () => {
    setProduct(null);
    setLastResult(null);
    setQty('');
    setNotes('');
    isProcessingRef.current = false;
    setScanning(true);

    setTimeout(() => {
      const scanner = new Html5Qrcode(CAMERA_ID);
      scannerRef.current = scanner;
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (isProcessingRef.current) return;
          if (!decodedText.startsWith('backero:inv:')) return;
          isProcessingRef.current = true;
          const pid = decodedText.replace('backero:inv:', '');
          handleScanned(pid, scanner);
        },
        () => {}
      ).catch(() => {});
    }, 300);
  };

  const handleSubmit = async () => {
    const quantity = Number(qty);
    if (!qty || isNaN(quantity) || quantity <= 0) {
      return toast.error('Enter a valid quantity');
    }

    setSubmitting(true);
    try {
      const endpoint =
        movType === 'IN' ? '/inventory/stock-in' :
        movType === 'OUT' ? '/inventory/stock-out' :
        '/inventory/adjustment';

      const payload =
        movType === 'ADJUST'
          ? { productId: product._id, newQuantity: quantity, notes }
          : { productId: product._id, quantity, notes };

      await api.post(endpoint, payload);

      setLastResult({
        name: product.name,
        movType,
        qty: quantity,
        unit: product.unit,
      });
      if (onSuccess) onSuccess();
      toast.success(`Stock ${movType === 'IN' ? 'added' : movType === 'OUT' ? 'deducted' : 'adjusted'}`);
      resetScanner();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Stock movement failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#070c17] w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#1b2e4a]">
          <h2 className="font-bold text-gray-900 dark:text-white text-base">Scan QR to Update Stock</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Last result banner */}
        {lastResult && (
          <div className="mx-4 mt-3 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg px-3 py-2">
            <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-xs text-green-700 dark:text-green-400">
              {lastResult.name} — {lastResult.movType === 'IN' ? '+' : lastResult.movType === 'OUT' ? '-' : '='}{lastResult.qty} {lastResult.unit}
            </p>
          </div>
        )}

        {/* Camera / form area */}
        <div className="p-4 space-y-4">
          {/* Scanner viewport — always mounted in DOM */}
          <div className={clsx('rounded-xl overflow-hidden border-2 border-dashed', scanning ? 'border-brand-500' : 'border-transparent h-0 overflow-hidden')}>
            <div id={CAMERA_ID} className={scanning ? 'w-full' : 'hidden'} />
            {scanning && (
              <p className="text-center text-xs text-gray-400 py-2">Point camera at a Backero QR label</p>
            )}
          </div>

          {/* Loading */}
          {loadingProduct && (
            <div className="flex flex-col items-center py-6 gap-2">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Loading product...</p>
            </div>
          )}

          {/* Product + movement form */}
          {product && !loadingProduct && (
            <div className="space-y-4">
              {/* Product card */}
              <div className="bg-gray-50 dark:bg-[#0a1628] rounded-xl p-3 border border-gray-200 dark:border-[#1b2e4a]">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{product.name}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{product.sku}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Current stock: <span className="font-semibold text-gray-800 dark:text-gray-200">{product.currentStock} {product.unit}</span>
                </p>
              </div>

              {/* Movement type */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'IN', label: 'Stock In', color: 'green' },
                  { value: 'OUT', label: 'Stock Out', color: 'red' },
                  { value: 'ADJUST', label: 'Adjust', color: 'blue' },
                ].map(({ value, label, color }) => (
                  <button
                    key={value}
                    onClick={() => setMovType(value)}
                    className={clsx(
                      'py-2 rounded-lg text-xs font-semibold border-2 transition-colors',
                      movType === value
                        ? color === 'green' ? 'bg-green-600 text-white border-green-600'
                          : color === 'red' ? 'bg-red-600 text-white border-red-600'
                          : 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 dark:border-[#1b2e4a] text-gray-600 dark:text-gray-400'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Quantity */}
              <div>
                <label className="label text-xs">
                  {movType === 'ADJUST' ? 'New Quantity' : 'Quantity'} ({product.unit})
                </label>
                <input
                  type="number"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="input"
                  placeholder={movType === 'ADJUST' ? 'Set new stock level' : 'Enter quantity'}
                  autoFocus
                />
              </div>

              {/* Notes */}
              <div>
                <label className="label text-xs">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input"
                  placeholder="Reason, batch, etc."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={resetScanner}
                  className="btn-secondary flex items-center gap-1.5 text-xs px-3"
                >
                  <ArrowPathIcon className="w-4 h-4" /> Scan Again
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary flex-1 justify-center text-sm"
                >
                  {submitting ? 'Saving...' : 'Confirm Movement'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
