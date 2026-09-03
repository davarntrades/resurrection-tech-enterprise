import type { Config } from "tailwindcss";

/**
 * Tailwind is configured for layout utilities only.
 * The Resurrection Tech design system (colours, type, components) lives in
 * styles/design-system.css, with the editorial + control-system primitives in
 * styles/rt-system.css. Tokens are mirrored here so utilities can reference the
 * same palette.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#ffffff",
        "bg-1": "#fbfaf7",
        "bg-2": "#f6f4f0",
        panel: "#ffffff",
        "panel-2": "#f6f4f0",
        ink: "#101114",
        "ink-2": "#4a4e55",
        "ink-3": "#767b83",
        "ink-4": "#a2a7ae",
        accent: "#123a9e",
        "accent-bright": "#1746c4",
        omega: "#a81e12",
        ok: "#0b6b45",
        escalate: "#8a5a00",
      },
      fontFamily: {
        sans: ["Geist", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["Instrument Serif", "Iowan Old Style", "Georgia", "serif"],
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
