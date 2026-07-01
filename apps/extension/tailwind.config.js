/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7f9',
          100: '#dcf0f3',
          200: '#bbe1e7',
          300: '#8dcbd7',
          400: '#62c0bf', // Mint-Teal
          500: '#418ca3', // Teal-Blue
          600: '#34718a',
          700: '#295f8a', // Slate Blue
          800: '#255071',
          900: '#0f3a5f', // Deep Navy
        },
      },
    },
  },
  plugins: [],
}
