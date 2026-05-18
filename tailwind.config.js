/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        secondary: '#64748b',
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
        'xs': ['var(--text-xs)', { lineHeight: 'var(--leading-normal)', fontWeight: '500' }],
        'sm': ['var(--text-sm)', { lineHeight: 'var(--leading-normal)', fontWeight: '500' }],
        'base': ['var(--text-base)', { lineHeight: 'var(--leading-normal)', fontWeight: '400' }],
        'lg': ['var(--text-lg)', { lineHeight: 'var(--leading-normal)', fontWeight: '500' }],
        'xl': ['var(--text-xl)', { lineHeight: 'var(--leading-snug)', fontWeight: '600' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-snug)', fontWeight: '700' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)', fontWeight: '800' }],
        '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)', fontWeight: '900' }],
        '5xl': ['var(--text-5xl)', { lineHeight: '0.9', fontWeight: '900' }],
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
