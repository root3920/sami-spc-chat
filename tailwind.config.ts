import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#082653", 900: "#061e42", 700: "#0c4c92" },
        brand: { DEFAULT: "#ff8d2c", light: "#ffa642", dark: "#cb5008", soft: "#fff6ea" },
        ink: "#102b4c",
        muted: "#54647a",
        cream: "#fffdf9",
        sky: "#edf5ff",
        line: "#d7e3ef",
      },
      fontFamily: { sans: ["var(--font-manrope)", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
