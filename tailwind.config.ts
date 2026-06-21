import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        anymon: {
          white: "#FFFFFF",
          lime: "#32CD32",
          ocean: "#00BFFF",
          ink: "#0b1f24",
          cloud: "#f3fbf4",
        },
      },
      fontFamily: {
        sans: ["Quicksand", "ui-rounded", "system-ui", "sans-serif"],
        retro: ["Doto", "ui-monospace", "monospace"],
      },
      boxShadow: {
        gummy: "0 10px 0 0 rgba(0,0,0,0.08), 0 14px 30px -6px rgba(0,191,255,0.35)",
        "gummy-lime": "0 8px 0 0 #228B22, 0 16px 26px -8px rgba(50,205,50,0.55)",
      },
      borderRadius: {
        gummy: "2rem",
      },
      keyframes: {
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        pop: {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        bob: "bob 2.4s ease-in-out infinite",
        pop: "pop 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
