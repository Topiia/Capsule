/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Noir Velvet Theme
        'noir-velvet': {
          50: '#f8f9fa',
          100: '#e9ecef',
          200: '#dee2e6',
          300: '#ced4da',
          400: '#adb5bd',
          500: '#6c757d',
          600: '#495057',
          700: '#343a40',
          800: '#232526',
          900: '#414345',
        },
        // Deep Space Theme
        'deep-space': {
          50: '#f0f4ff',
          100: '#e6f0ff',
          200: '#b3d9ff',
          300: '#80c2ff',
          400: '#4dabff',
          500: '#1a94ff',
          600: '#0077e6',
          700: '#005bb3',
          800: '#0D1452',
          900: '#004E92',
        },
        // Crimson Night Theme
        'crimson-night': {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#3A1C71',
          900: '#D76D77',
        },
        // Glass morphism
        'glass': {
          'white': 'rgba(255, 255, 255, 0.1)',
          'black': 'rgba(0, 0, 0, 0.1)',
          'white-20': 'rgba(255, 255, 255, 0.2)',
          'black-20': 'rgba(0, 0, 0, 0.2)',
        }
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'display': ['Poppins', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 3s infinite',
        'spin-slow': 'spin 3s linear infinite',
        'gradient': 'gradient 8s ease infinite',
        'aurora': 'aurora 10s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          'from': { textShadow: '0 0 20px rgba(255, 255, 255, 0.5)' },
          'to': { textShadow: '0 0 30px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.6)' },
        },
        gradient: {
          '0%, 100%': { 
            'background-size': '200% 200%',
            'background-position': 'left center' 
          },
          '50%': { 
            'background-size': '200% 200%',
            'background-position': 'right center' 
          },
        },
        aurora: {
          '0%': { transform: 'translateX(-100%) translateY(-100%) rotate(0deg)' },
          '25%': { transform: 'translateX(100%) translateY(-100%) rotate(90deg)' },
          '50%': { transform: 'translateX(100%) translateY(100%) rotate(180deg)' },
          '75%': { transform: 'translateX(-100%) translateY(100%) rotate(270deg)' },
          '100%': { transform: 'translateX(-100%) translateY(-100%) rotate(360deg)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-inset': 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
        'glow': '0 0 20px rgba(255, 255, 255, 0.3)',
        'glow-lg': '0 0 40px rgba(255, 255, 255, 0.4)',
      },
      backgroundImage: {
        'gradient-noir': 'linear-gradient(135deg, #232526 0%, #414345 100%)',
        'gradient-deep-space': 'linear-gradient(135deg, #0D1452 0%, #004E92 100%)',
        'gradient-crimson': 'linear-gradient(135deg, #3A1C71 0%, #D76D77 100%)',
        'gradient-aurora': 'linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)',
        'gradient-rainbow': 'linear-gradient(90deg, #ff0000, #ff8000, #ffff00, #80ff00, #00ff00, #00ff80, #00ffff, #0080ff, #0000ff, #8000ff, #ff00ff, #ff0080)',
      },
    },
  },
  plugins: [],
}