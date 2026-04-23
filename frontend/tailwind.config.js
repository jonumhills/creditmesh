/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        okx: {
          bg:      "#0a0a0a",
          card:    "#0f0f0f",
          card2:   "#141414",
          border:  "#1e1e1e",
          border2: "#2a2a2a",
          green:   "#10b981",
          red:     "#ef4444",
          yellow:  "#f59e0b",
          blue:    "#f97316",   // primary accent — orange
          orange:  "#f97316",
          muted:   "#9ca3af",
          dim:     "#6b7280",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
