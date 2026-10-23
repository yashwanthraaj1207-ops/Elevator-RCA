// tailwind.config.cjs
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: "var(--bg-app)",
        sidebar: "var(--bg-sidebar)",
        card: "var(--bg-card)",
        surface: "var(--bg-surface)",
        "surface-hover": "var(--bg-surface-hover)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        accent: "var(--accent-sage)",
        "accent-hover": "var(--accent-sage-hover)",
        sage: {
          DEFAULT: "var(--accent-sage)",
          hover: "var(--accent-sage-hover)",
        },
        amber: {
          warm: "var(--accent-amber)",
          DEFAULT: "var(--accent-amber)",
        },
        coral: {
          DEFAULT: "var(--accent-coral)",
          warm: "var(--accent-coral)",
        },
        healthy: "var(--accent-sage)",
        warning: "var(--accent-amber)",
        fault: "var(--accent-coral)",
        border: "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        elevated: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};
