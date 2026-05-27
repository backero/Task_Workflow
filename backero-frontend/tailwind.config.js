/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef3ff',
          100: '#dce6ff',
          200: '#b2c8ff',
          300: '#7da2ff',
          400: '#4d76f9',
          500: '#2a52ef',
          600: '#1a3dd4',
          700: '#162eb0',
          800: '#112270',  // navy core
          900: '#0c1848',  // deep navy
          950: '#070e2e',
        },
        accent: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',  // brand green
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        dept: {
          marketing: '#9333ea',
          marketplace: '#f97316',
          sales: '#22c55e',
          production: '#3b82f6',
          finance: '#10b981',
          rnd: '#06b6d4',
          operations: '#6366f1',
          hr: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)',
        modal: '0 32px 64px -12px rgba(0,0,0,0.3)',
        glow: '0 0 20px rgba(34,197,94,0.25)',
        'glow-blue': '0 0 20px rgba(59,130,246,0.25)',
        'navy': '0 8px 32px rgba(17,34,112,0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'fade-slide-up': 'fadeSlideUp 0.3s ease-out both',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'shimmer': 'shimmer 1.8s linear infinite',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        fadeSlideUp: { from: { opacity: 0, transform: 'translateY(14px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideUp: { from: { transform: 'translateY(10px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        slideDown: { from: { transform: 'translateY(-10px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
    },
  },
  plugins: [],
};
