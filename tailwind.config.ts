import type { Config } from "tailwindcss";

/**
 * Tailwind is configured for layout utilities only.
 * The Resurrection Tech design system (colours, type, components) lives in
 * styles/design-system.css and is reused verbatim from the approved design.
 * Tokens are mirrored here so utilities can reference the same palette.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#08090b",
        "bg-1": "#0b0d10",
        panel: "#0f1216",
        "panel-2": "#14181d",
        ink: "#f3f5f7",
        "ink-2": "#aab2bd",
        "ink-3": "#6b7480",
        "ink-4": "#474e58",
        accent: "#4c7dff",
        "accent-bright": "#6f97ff",
        "accent-purple": "#6d5cff",
        omega: "#e5484d",
        ok: "#3fb27f",
      },
      fontFamily: {
        sans: ["Geist", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        wrap: "1240px",
      },
    },
  },
  plugins: [],
  // The reused design system owns all base/reset styles, so Tailwind's
  // preflight is disabled to avoid overriding the approved visual language.
  corePlugins: { preflight: false },
};

export default config;
