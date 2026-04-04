/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        serif: ["DM Serif Display", "Georgia", "serif"],
      },
      colors: {
        brand: {
          50: "#f0f9f4",
          100: "#e8f5ee",
          600: "#2d7a4a",
          700: "#1d5c3a",
          900: "#1a3c2b",
        },
      },
    },
  },
  plugins: [],
};
