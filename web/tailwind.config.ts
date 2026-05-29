import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: "#FBFAF7", // warm cream canvas (never pure white)
          panel: "#FFFFFF", // inner card core
          shell: "#F2F0EA", // double-bezel outer shell
          border: "#E9E6DE", // soft hairline
          muted: "#8B8678", // warm grey text
          text: "#1A1917", // off-black / espresso ink
          accent: "#C75B39", // restrained warm clay
          accent2: "#E0875B",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 20px 40px -15px rgba(0,0,0,0.06)",
        softer: "0 12px 30px -18px rgba(0,0,0,0.08)",
        lift: "0 30px 60px -20px rgba(0,0,0,0.10)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.32,0.72,0,1)",
      },
      keyframes: {
        drift: {
          "0%,100%": { transform: "translate(-8%, -4%) scale(1)" },
          "50%": { transform: "translate(8%, 6%) scale(1.12)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        drift: "drift 26s ease-in-out infinite",
        rise: "rise 700ms cubic-bezier(0.32,0.72,0,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
