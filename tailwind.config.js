/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E3A8A', // Deep Blue
          light: '#3B82F6',
          dark: '#1E40AF'
        },
        secondary: {
          DEFAULT: '#14B8A6', // Teal
          light: '#5EEAD4',
          dark: '#0D9488'
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        bg: '#F5F5F5'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
