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
          // fun, punchy lime green (was a blue-ish #32CD32)
          lime: "#8BE01E",
          // deeper lime used for hard offset shadows / pressed states
          limedark: "#5CA30F",
          // de-emphasized secondary blue
          ocean: "#3FB0D6",
          // Persona-5 style accent
          berry: "#FF3B53",
          // near-black for chunky borders + text
          ink: "#0a1418",
          cloud: "#f3fbf4",
        },
      },
      fontFamily: {
        sans: ["Quicksand", "ui-rounded", "system-ui", "sans-serif"],
        retro: ["Doto", "ui-monospace", "monospace"],
      },
      boxShadow: {
        gummy: "0 8px 0 0 rgba(0,0,0,0.85), 0 14px 24px -8px rgba(0,0,0,0.45)",
        "gummy-lime": "0 8px 0 0 #5CA30F, 0 14px 22px -8px rgba(139,224,30,0.45)",
        // hard, angular offset shadows for the retro / Persona look
        retro: "4px 4px 0 0 #0a1418",
        "retro-lg": "6px 6px 0 0 #0a1418",
        "retro-berry": "5px 5px 0 0 #FF3B53",
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
