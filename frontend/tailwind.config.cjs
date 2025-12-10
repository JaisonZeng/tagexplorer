/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#14b8a6",
          dark: "#0f766e",
        },
      },
      boxShadow: {
        glow: "0 0 30px rgba(20, 184, 166, 0.3)",
      },
    },
  },
  plugins: [],
};
