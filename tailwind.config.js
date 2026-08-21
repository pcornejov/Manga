/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta oscura propia: el lector necesita fondo neutro que no compita con la página.
        ink: {
          900: '#0b0b0f',
          800: '#131320',
          700: '#1c1c2b',
          600: '#282838',
          400: '#6b6b85',
          200: '#c7c7d6',
        },
        accent: '#f97316',
      },
    },
  },
  plugins: [],
};
