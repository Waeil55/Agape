/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        secondary: '#64748b',
        blue: {
          55: '#F4F7FC',
          50: '#EEF5FF',
          100: '#EAF2FF',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        indigo: {
          50: '#EEF5FF',
          100: '#EAF2FF',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
          950: '#172554',
        },
        surface: {
          DEFAULT: 'var(--bg-surface)',
          elevated: 'var(--bg-surface-elevated)',
          subtle: 'var(--bg-surface-subtle)',
        },
        brand: {
          DEFAULT: 'var(--brand-primary)',
          hover: 'var(--brand-primary-hover)',
          light: 'var(--brand-primary-light)',
          subtle: 'var(--brand-primary-subtle)',
          accent: 'var(--brand-accent)',
        },
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      fontSize: {
        'display': ['var(--text-5xl)', { lineHeight: '0.9', fontWeight: '900' }],
        'hero': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)', fontWeight: '900' }],
        'title': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)', fontWeight: '800' }],
        'heading': ['var(--text-2xl)', { lineHeight: 'var(--leading-snug)', fontWeight: '700' }],
        'subheading': ['var(--text-xl)', { lineHeight: 'var(--leading-snug)', fontWeight: '600' }],
        'body-lg': ['var(--text-lg)', { lineHeight: 'var(--leading-normal)', fontWeight: '400' }],
        'body': ['var(--text-base)', { lineHeight: 'var(--leading-normal)', fontWeight: '400' }],
        'caption': ['var(--text-sm)', { lineHeight: 'var(--leading-normal)', fontWeight: '500' }],
        'micro': ['var(--text-xs)', { lineHeight: 'var(--leading-normal)', fontWeight: '600' }],
      },
      borderRadius: {
        'card': 'var(--radius-2xl)',
        'button': 'var(--radius-xl)',
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'elevated': 'var(--shadow-elevated)',
      },
      minHeight: {
        'touch': 'var(--touch-min)',
      },
      minWidth: {
        'touch': 'var(--touch-min)',
      },
      spacing: {
        'touch': 'var(--touch-min)',
      },
      backdropBlur: {
        'glass': 'var(--glass-blur)',
      },
    },
  },
  plugins: [],
}
