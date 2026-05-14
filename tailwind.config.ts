import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: [
          'var(--font-serif)',
          '"Source Serif 4"',
          'Georgia',
          '"Times New Roman"',
          'serif',
        ],
        display: [
          'var(--font-display)',
          '"Newsreader"',
          'Georgia',
          'serif',
        ],
        mono: [
          'var(--font-mono)',
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
        sans: [
          'var(--font-serif)',
          '"Source Serif 4"',
          'Georgia',
          'serif',
        ],
      },
      colors: {
        // Editorial palette
        paper: {
          DEFAULT: '#f4efe2',
          light: '#faf6ea',
          deep: '#ebe4d1',
        },
        ink: {
          DEFAULT: '#1a2541',
          dim: '#4a5568',
          faint: '#7a8294',
        },
        oxblood: {
          DEFAULT: '#7a1f2a',
          bright: '#9b2935',
        },
        gold: {
          DEFAULT: '#b8923f',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '40px',
        '3xl': '64px',
      },
      boxShadow: {
        'glass': '0 4px 24px rgba(26,37,65,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-sm': '0 2px 8px rgba(26,37,65,0.05)',
        'editorial': '0 6px 28px rgba(26,37,65,0.07), inset 0 1px 0 rgba(255,255,255,0.65)',
      },
      opacity: {
        '4': '0.04',
        '6': '0.06',
        '8': '0.08',
        '12': '0.12',
        '14': '0.14',
        '18': '0.18',
      },
      letterSpacing: {
        'editorial': '0.18em',
      },
    },
  },
  plugins: [],
}
export default config
