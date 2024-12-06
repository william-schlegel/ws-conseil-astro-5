/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");

export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        primary: "#003055",
        secondary: "#00bfac",
        bg: {
          primary: "#f4f4f4",
          secondary: "#ffffff",
        },
      },
      fontFamily: {
        titres: ['"Kumbh Sans"', ...defaultTheme.fontFamily.sans],
        textes: ['"Philosopher"', ...defaultTheme.fontFamily.serif],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
