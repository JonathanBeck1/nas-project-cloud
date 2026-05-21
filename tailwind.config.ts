import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        signal: "rgb(var(--color-signal) / <alpha-value>)",
        steel: "rgb(var(--color-steel) / <alpha-value>)"
      },
      boxShadow: {
        panel: "0 1px 2px rgb(0 0 0 / 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
