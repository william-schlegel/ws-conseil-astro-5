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
        abyss: "#020a13",
        deep: "#061a2b",
        navy: "#00213a",
        brand: "#00467c",
        mint: "#2cdd9b",
        cyan: "#1dc8cd",
        foam: "#eef6f7",
        mist: "#9db0c2",
        buoy: "#ff8a4c",
        bg: {
          white: "white",
          dark: "#343a40",
          light: "#f5f7fa",
          white01: "rgba(255, 255, 255, 0.1)",
          white06: "rgba(255, 255, 255, 0.6)",
        },
      },
      fontFamily: {
        titres: ['"Fraunces Variable"', ...defaultTheme.fontFamily.serif],
        textes: ['"Kumbh Sans Variable"', ...defaultTheme.fontFamily.sans],
        mono: ['"Martian Mono Variable"', ...defaultTheme.fontFamily.mono],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
