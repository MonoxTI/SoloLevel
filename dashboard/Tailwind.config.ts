import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-mono)", "monospace"],
        display: ["var(--font-display)", "sans-serif"],
      },
      colors: {
        bg: {
          DEFAULT: "#0a0c0f",
          2: "#111418",
          3: "#181c22",
          4: "#1e242c",
        },
        cyan: {
          DEFAULT: "#00e5ff",
          dim: "#00b8cc",
          muted: "#003a42",
        },
        green: {
          DEFAULT: "#00ff88",
          dim: "#00b85e",
          muted: "#003320",
        },
        amber: {
          DEFAULT: "#ffb300",
          dim: "#cc8c00",
          muted: "#1c1500",
        },
        red: {
          DEFAULT: "#ff4444",
          dim: "#cc2222",
          muted: "#1a0000",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          bright: "rgba(255,255,255,0.13)",
        },
        muted: "#5a6474",
        ink: "#c8d4e0",
        "ink-2": "#8899aa",
      },
    },
  },
  plugins: [],
};

export default config;