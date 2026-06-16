/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cognition: {
          50: '#f0f5ff',
          100: '#e0ebff',
          200: '#c2d6ff',
          300: '#8fb8ff',
          400: '#5999ff',
          500: '#3377ff',
          600: '#1a56f5',
          700: '#1342e0',
          800: '#1635b6',
          900: '#18308f',
          950: '#142056',
        },
        dark: {
          50: '#f6f6f6',
          100: '#e7e7e7',
          200: '#d1d1d1',
          300: '#b0b0b0',
          400: '#888888',
          500: '#6d6d6d',
          600: '#5d5d5d',
          700: '#4f4f4f',
          800: '#454545',
          900: '#3d3d3d',
          950: '#1a1a2e',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'breathe': 'breathe 2s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '0.4', boxShadow: '0 0 8px 2px rgba(51,119,255,0.3)' },
          '50%': { opacity: '1', boxShadow: '0 0 16px 6px rgba(51,119,255,0.6)' },
        },
      },
    },
  },
  plugins: [],
};