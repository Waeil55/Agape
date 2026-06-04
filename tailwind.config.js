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
        primary: '#2563eb',
        secondary: '#64748b',
        slate: {
          50: 'rgb(var(--c-slate-50) / <alpha-value>)',
          100: 'rgb(var(--c-slate-100) / <alpha-value>)',
          200: 'rgb(var(--c-slate-200) / <alpha-value>)',
          300: 'rgb(var(--c-slate-300) / <alpha-value>)',
          400: 'rgb(var(--c-slate-400) / <alpha-value>)',
          500: 'rgb(var(--c-slate-500) / <alpha-value>)',
          600: 'rgb(var(--c-slate-600) / <alpha-value>)',
          700: 'rgb(var(--c-slate-700) / <alpha-value>)',
          800: 'rgb(var(--c-slate-800) / <alpha-value>)',
          900: 'rgb(var(--c-slate-900) / <alpha-value>)',
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
