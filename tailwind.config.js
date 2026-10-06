/*
 * Solar's palette. The Tailwind colour names used across the app are kept
 * (each one stands for a subject: amber = sun, sky = home, emerald = battery,
 * violet = grid, teal = money, rose = settings and errors, slate = neutrals)
 * but drawn in Solar's own warm sand, terracotta and brown tones.
 */
const palette = {
  // neutrals: warm paper and brown ink
  slate: { 50: "#fdfbf7", 100: "#f7f1e8", 200: "#ecdfd0", 300: "#dccbb7", 400: "#b5a393", 500: "#8f7f72", 600: "#6f6258", 700: "#594338", 800: "#45342b", 900: "#342820", 950: "#241a14" },
  // brand sand (overview, focus, links)
  indigo: { 50: "#fbf3e8", 100: "#f6e6d0", 200: "#ecd0a8", 300: "#e0b98a", 400: "#d4a373", 500: "#c48a55", 600: "#a87044", 700: "#8a5a38", 800: "#6f482e", 900: "#5a3b27", 950: "#3a2618" },
  // home: terracotta
  sky: { 50: "#fbf1ec", 100: "#f6ddd2", 200: "#e9c2ae", 300: "#dda58a", 400: "#d28c6c", 500: "#c8795a", 600: "#b0623f", 700: "#8f4e33", 800: "#733f2b", 900: "#5c3324", 950: "#3b2016" },
  // sun: gold
  amber: { 50: "#fdf6e3", 100: "#faedcd", 200: "#f4d58d", 300: "#ecc35f", 400: "#e2ad3c", 500: "#d99a2b", 600: "#b97d1e", 700: "#94611a", 800: "#774d19", 900: "#624018", 950: "#3d270d" },
  // battery: deep emerald
  emerald: { 50: "#ecf7f3", 100: "#d3ece3", 200: "#a9dccb", 300: "#7cc7b0", 400: "#48ab8f", 500: "#249377", 600: "#16866a", 700: "#126b56", 800: "#115546", 900: "#0f463a", 950: "#072a23" },
  // grid: dusty blue
  violet: { 50: "#eef3f7", 100: "#dbe6ee", 200: "#bcd0df", 300: "#94b3c9", 400: "#6d94b0", 500: "#527a98", 600: "#41647f", 700: "#365167", 800: "#2f4455", 900: "#2a3a48", 950: "#1a2530" },
  // money: olive
  teal: { 50: "#f4f6ea", 100: "#e6ebcf", 200: "#cfd9a5", 300: "#b3c275", 400: "#98a94f", 500: "#7c8d38", 600: "#61702b", 700: "#4b5724", 800: "#3d4621", 900: "#343c1f", 950: "#1b200e" },
  // settings and errors: brick
  rose: { 50: "#fcf1ef", 100: "#f9dfdb", 200: "#f2c0b8", 300: "#e8988c", 400: "#dc6f61", 500: "#cc4f40", 600: "#b33c2f", 700: "#942f26", 800: "#7a2a23", 900: "#662721", 950: "#38110e" },
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
