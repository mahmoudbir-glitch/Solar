/*
 * Solar's palette. Every colour name stands for one subject, and its numbers,
 * icons and tabs all use it: amber = sun, sky = home, emerald = battery,
 * violet = grid, teal = money, rose = settings and errors, indigo = the brand
 * and the overview, slate = neutrals.
 */
const palette = {
  // neutrals: cool blue-grey paper and deep navy ink
  slate: { 50: "#f4f6fc", 100: "#eaeef8", 200: "#dbe1f0", 300: "#c2cbe1", 400: "#96a1c0", 500: "#687499", 600: "#4b567a", 700: "#394264", 800: "#272f50", 900: "#181f3f", 950: "#0e132c" },
  // brand and overview: royal indigo
  indigo: { 50: "#eef0ff", 100: "#dfe3ff", 200: "#c5cbff", 300: "#a2a9ff", 400: "#7d82fb", 500: "#5f5ff2", 600: "#4d47e0", 700: "#4039c2", 800: "#35319b", 900: "#2e2d7a", 950: "#1c1b4b" },
  // home: bright blue
  sky: { 50: "#eaf5ff", 100: "#d4e9ff", 200: "#aad3ff", 300: "#74b6ff", 400: "#4296fb", 500: "#2077f0", 600: "#145ddf", 700: "#1449b7", 800: "#163f90", 900: "#173771", 950: "#0f2247" },
  // sun: warm yellow-orange
  amber: { 50: "#fff8e5", 100: "#ffeec0", 200: "#ffdf88", 300: "#ffcb4a", 400: "#ffb61c", 500: "#f59c00", 600: "#d97c00", 700: "#b25b02", 800: "#904608", 900: "#76390b", 950: "#431d03" },
  // battery: fresh green
  emerald: { 50: "#e8fbef", 100: "#cbf6db", 200: "#9becbc", 300: "#60dc96", 400: "#2cc673", 500: "#10ab5a", 600: "#078a47", 700: "#076e3b", 800: "#095731", 900: "#08482a", 950: "#032816" },
  // grid: electric purple
  violet: { 50: "#f5efff", 100: "#ebe0ff", 200: "#d8c4ff", 300: "#bd9bff", 400: "#a06ffb", 500: "#8548f2", 600: "#712fe0", 700: "#5f24bd", 800: "#4e2099", 900: "#411e7b", 950: "#28104f" },
  // money: turquoise
  teal: { 50: "#e7fbfa", 100: "#c6f4f1", 200: "#93e8e3", 300: "#58d6d0", 400: "#27bfba", 500: "#0ea3a0", 600: "#088382", 700: "#0a6869", 800: "#0d5354", 900: "#0f4546", 950: "#03292b" },
  // settings and errors: raspberry
  rose: { 50: "#fff0f3", 100: "#ffdce4", 200: "#ffbfce", 300: "#ff91ab", 400: "#fb5a81", 500: "#ee2d5f", 600: "#d3164a", 700: "#af0f3e", 800: "#911039", 900: "#7a1135", 950: "#450418" },
};
palette.blue = palette.indigo;
palette.cyan = palette.violet;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: { colors: palette },
  },
  plugins: [],
}
