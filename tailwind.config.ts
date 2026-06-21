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
          // collectible-card base (warm red, never black/ink)
          card: "#E24040",
          // ---- cohesive outline tokens ----
          // Each is a DARKER + COOLER shade of the matching fill so outlines
          // read as a tasteful "edge" instead of a clashing pure-black border.
          edgelime: "#4E8F2C",
          edgeberry: "#C42A46",
          edgeocean: "#2C83A6",
          edgecloud: "#C2D5CC",
          edgecard: "#B23647",
          // for dark/ink panels: a deep cool teal-black (not pure black)
          edgeink: "#04222a",
          // ---- coins (golden yellow / amber-gold) ----
          // coin text color + a darker golden "edge" for the counter border/shadow
          // so the counter outline reads as a tint of its own text (design rule).
          coin: "#EAB308",
          edgecoin: "#A16207",
          // dark, faded card-red used for emphasis text (e.g. "Trainer X")
          cardink: "#8C2B38",
        },
      },
      fontFamily: {
        sans: ["Quicksand", "ui-rounded", "system-ui", "sans-serif"],
        retro: ["Doto", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // NOTE (design rule): every shadow has NO horizontal offset (x = 0) and a
        // downward (positive y) offset only. Shadow color is never black — it is a
        // DARKER shade of the element's own edge/outline token.
        // gummy: default white/cloud card -> darker edgecloud (#C2D5CC).
        gummy: "0 4px 0 0 #93AEA2, 0 8px 14px -8px #6E8A7E",
        // gummy-lime: lime element -> darker edgelime (#4E8F2C).
        "gummy-lime": "0 4px 0 0 #3C6E22, 0 8px 12px -8px #3C6E22",
        // retro: ink/default panels -> darker edgeink (#04222a).
        retro: "0 3px 0 0 #02161b",
        "retro-lg": "0 4px 0 0 #02161b",
        // retro-berry: berry element -> darker edgeberry (#C42A46).
        "retro-berry": "0 3px 0 0 #9E2138",
      },
      borderRadius: {
        // single standardized app-wide corner radius (cards opt out -> sharp)
        gummy: "1rem",
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
