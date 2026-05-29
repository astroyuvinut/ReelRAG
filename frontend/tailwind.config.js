/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink:   "#080808",
        coal:  "#0e0e0e",
        smoke: "#141414",
        ash:   "#1a1a1a",
        bone:  "#f5f5f0",
        cream: "#e8e6df",
        red:   { DEFAULT: "#ff2200", glow: "#ff3a18", deep: "#a81400" },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        mono:    ['"JetBrains Mono"', "monospace"],
        serif:   ['"Fraunces"', "serif"],
      },
      letterSpacing: {
        tightest: "-0.06em",
        wider:    "0.12em",
        widest:   "0.24em",
        ultra:    "0.4em",
      },
      animation: {
        "fade-in":       "fadeIn 0.6s ease-out forwards",
        "flicker":       "flicker 7s linear infinite",
        "marquee":       "marquee 30s linear infinite",
        "marquee-rev":   "marqueeRev 35s linear infinite",
        "drift":         "drift 28s ease-in-out infinite",
        "lens-flare":    "lensFlare 2s ease-out forwards",
        "grain-shift":   "grainShift 8s steps(10) infinite",
        "blob-morph":    "blobMorph 16s ease-in-out infinite",
        "scan":          "scan 4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0, transform: "translateY(20px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        flicker: {
          "0%, 95%, 100%": { opacity: 1, filter: "none" },
          "96%": { opacity: 0.4, filter: "blur(0.6px) hue-rotate(8deg)" },
          "97%": { opacity: 1, filter: "none" },
          "98%": { opacity: 0.7, filter: "blur(0.3px)" },
          "99%": { opacity: 1 },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        marqueeRev: {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        drift: {
          "0%, 100%": { transform: "translate(0,0) rotate(0deg)" },
          "33%": { transform: "translate(40px, -30px) rotate(8deg)" },
          "66%": { transform: "translate(-30px, 40px) rotate(-6deg)" },
        },
        lensFlare: {
          "0%":   { transform: "translateX(-120%) skewX(-25deg)", opacity: 0 },
          "30%":  { opacity: 0.6 },
          "100%": { transform: "translateX(120%) skewX(-25deg)", opacity: 0 },
        },
        grainShift: {
          "0%, 100%": { transform: "translate(0,0)" },
          "10%": { transform: "translate(-5%,-3%)" },
          "30%": { transform: "translate(3%,-7%)" },
          "50%": { transform: "translate(-7%,2%)" },
          "70%": { transform: "translate(5%,-5%)" },
          "90%": { transform: "translate(-3%,4%)" },
        },
        blobMorph: {
          "0%, 100%": { borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%" },
          "33%": { borderRadius: "30% 70% 70% 30% / 40% 60% 30% 70%" },
          "66%": { borderRadius: "70% 30% 50% 50% / 30% 70% 60% 40%" },
        },
        scan: {
          "0%, 100%": { transform: "translateY(-100%)", opacity: 0 },
          "50%": { opacity: 0.8 },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};
