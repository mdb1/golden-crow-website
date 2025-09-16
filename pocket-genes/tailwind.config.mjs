/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    screens: {
      'xs': '320px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      '3xl': '1800px',
    },
    extend: {
      colors: {
        'primary': {
          50: '#f0f4ff',
          100: '#e0e9ff',
          500: '#667eea',
          600: '#764ba2',
        },
        'secondary': {
          500: '#f093fb',
          600: '#f5576c',
        },
        'accent': {
          400: '#4facfe',
          500: '#00f2fe',
        },
        'dark': {
          bg: '#0a0e27',
          surface: '#1a1f3a',
          elevated: '#2d3561',
        },
        'text': {
          primary: '#ffffff',
          secondary: '#b8c5d1',
          accent: '#64b5f6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'responsive-xs': 'clamp(0.75rem, 2vw, 0.875rem)',
        'responsive-sm': 'clamp(0.875rem, 2.2vw, 1rem)',
        'responsive-base': 'clamp(1rem, 2.5vw, 1.125rem)',
        'responsive-lg': 'clamp(1.125rem, 3vw, 1.25rem)',
        'responsive-xl': 'clamp(1.25rem, 3.5vw, 1.5rem)',
        'responsive-2xl': 'clamp(1.5rem, 4vw, 2rem)',
        'responsive-3xl': 'clamp(1.875rem, 5vw, 2.5rem)',
        'responsive-4xl': 'clamp(2.25rem, 6vw, 3rem)',
        'responsive-5xl': 'clamp(3rem, 8vw, 4rem)',
        'responsive-6xl': 'clamp(3.75rem, 10vw, 6rem)',
      },
      spacing: {
        'responsive-xs': 'clamp(0.5rem, 2vw, 1rem)',
        'responsive-sm': 'clamp(1rem, 3vw, 1.5rem)',
        'responsive-md': 'clamp(1.5rem, 4vw, 2rem)',
        'responsive-lg': 'clamp(2rem, 5vw, 3rem)',
        'responsive-xl': 'clamp(3rem, 6vw, 4rem)',
        'responsive-2xl': 'clamp(4rem, 8vw, 6rem)',
        'responsive-3xl': 'clamp(5rem, 10vw, 8rem)',
      },
      maxWidth: {
        'responsive-sm': 'min(640px, 90vw)',
        'responsive-md': 'min(768px, 90vw)',
        'responsive-lg': 'min(1024px, 95vw)',
        'responsive-xl': 'min(1280px, 95vw)',
        'responsive-2xl': 'min(1536px, 95vw)',
        'responsive-3xl': 'min(1800px, 95vw)',
        'responsive-full': 'none',
      },
      animation: {
        'floating': 'floating 30s ease-in-out infinite',
      },
      keyframes: {
        floating: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '25%': { transform: 'translateY(-50px) rotate(90deg)' },
          '50%': { transform: 'translateY(30px) rotate(180deg)' },
          '75%': { transform: 'translateY(-25px) rotate(270deg)' },
        }
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}