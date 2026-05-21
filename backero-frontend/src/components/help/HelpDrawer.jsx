import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { XMarkIcon, QuestionMarkCircleIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import HELP from './HelpContent';

function matchRoute(pathname) {
  // Exact match first
  if (HELP[pathname]) return HELP[pathname];

  // Dynamic segments — try replacing last segment with :param
  const parts = pathname.split('/');
  if (parts.length >= 3) {
    const withParam = parts.slice(0, -1).join('/') + '/:' + parts[parts.length - 1].replace(/[^a-zA-Z]/g, '') || ':id';
    // e.g. /workflow/abc123 → try /workflow/:taskId
    const paramKey = Object.keys(HELP).find(k => {
      const kParts = k.split('/');
      if (kParts.length !== parts.length) return false;
      return kParts.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
    });
    if (paramKey) return HELP[paramKey];
  }

  // Prefix match — use the closest parent
  const sorted = Object.keys(HELP).sort((a, b) => b.length - a.length);
  const prefix = sorted.find(k => !k.includes(':') && pathname.startsWith(k) && k !== '/');
  if (prefix) return HELP[prefix];

  // Root fallback
  return HELP['/'];
}

function Section({ title, steps }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {open
          ? <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <ol className="px-4 py-3 space-y-2.5 bg-white">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-gray-600 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const content = matchRoute(location.pathname);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <>
      {/* Floating ? button */}
      <button
        onClick={() => setOpen(p => !p)}
        className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Help"
        aria-label="Open help"
      >
        <QuestionMarkCircleIcon className="w-6 h-6" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full z-50 w-80 bg-white shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-indigo-600">
          <div className="flex items-center gap-2">
            <QuestionMarkCircleIcon className="w-5 h-5 text-indigo-200" />
            <div>
              <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-wider">How to use</p>
              <h2 className="text-sm font-bold text-white">{content?.page || 'Help'}</h2>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
            <XMarkIcon className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Intro */}
        {content?.intro && (
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
            <p className="text-sm text-indigo-800 leading-relaxed">{content.intro}</p>
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {content?.sections?.map((sec, i) => (
            <Section key={i} title={sec.title} steps={sec.steps} />
          ))}
          {!content?.sections?.length && (
            <p className="text-sm text-gray-400 text-center py-8">No instructions available for this page yet.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[11px] text-gray-400 text-center">Instructions update automatically based on the page you're on.</p>
        </div>
      </div>
    </>
  );
}
