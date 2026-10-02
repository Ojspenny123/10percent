import type { Config } from "tailwindcss";

/**
 * Design tokens for Ten Percent.
 * Warm paper, coral accent, calm teal. Tuned for WCAG AA body text.
 */
const config: Config = {
  theme: {
    extend: {
      colors: {
        paper: "#F6F1EA",
        ink: "#241C18",
        muted: "#5C534E",
        card: "#FFFFFF",
        line: "#E4DBD1",
        blush: "#FDECE7",
        coral: {
          DEFAULT: "#C4533A",
          soft: "#E07A5F",
          dark: "#9A3E2A",
        },
        teal: {
          DEFAULT: "#1F7A72",
          soft: "#E7F4F2",
          dark: "#145751",
        },
        gold: {
          DEFAULT: "#8A5E12",
          soft: "#F8EFD9",
        },
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(36, 28, 24, 0.05), 0 10px 28px rgba(36, 28, 24, 0.06)",
      },
      borderRadius: {
        card: "1.25rem",
      },
    },
  },
};

export default config;
