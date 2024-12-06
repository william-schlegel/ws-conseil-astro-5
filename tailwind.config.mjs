/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");

export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        primary: "#00467c",
        "primary-dark": "#00213a",
        secondary: "#2cdd9b",
        "secondary-dark": "#1dc8cd",
        lightgrey: "#8d97ad",
        bg: {
          white: "white",
          dark: "#343a40",
          light: "#f5f7fa",
          white01: "rgba(255, 255, 255, 0.1)",
        },
      },
      fontFamily: {
        titres: ['"Philosopher"', ...defaultTheme.fontFamily.sans],
        textes: ['"Kumbh Sans"', ...defaultTheme.fontFamily.serif],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
