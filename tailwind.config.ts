import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f7f8f3",
        ink: "#171916",
        muted: "#626b5f",
        line: "#d8ded2",
        panel: "#ffffff",
        accent: "#256d5a",
        signal: "#b25f2c",
        steel: "#3b5f73"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(23, 25, 22, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
