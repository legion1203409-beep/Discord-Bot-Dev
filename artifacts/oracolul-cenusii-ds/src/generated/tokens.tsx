/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f3eee6",
      "foreground": "#1b1e23",
      "border": "#d8cec0",
      "card": "#fffaf2",
      "cardForeground": "#1b1e23",
      "popover": "#fffaf2",
      "popoverForeground": "#1b1e23",
      "primary": "#8d3929",
      "primaryForeground": "#fffaf2",
      "secondary": "#e8e1d7",
      "secondaryForeground": "#272722",
      "muted": "#e8e1d7",
      "mutedForeground": "#645f59",
      "accent": "#eadfc8",
      "accentForeground": "#302719",
      "destructive": "#a83f36",
      "destructiveForeground": "#fffaf2",
      "input": "#d8cec0",
      "ring": "#8d3929",
      "chart1": "#a94431",
      "chart2": "#8d7043",
      "chart3": "#786b8d",
      "chart4": "#527b89",
      "chart5": "#4e805f",
      "sidebar": "#e8e1d7",
      "sidebarForeground": "#272722",
      "sidebarBorder": "#d8cec0",
      "sidebarPrimary": "#8d3929",
      "sidebarPrimaryForeground": "#fffaf2",
      "sidebarAccent": "#ddd3c5",
      "sidebarAccentForeground": "#272722",
      "sidebarRing": "#8d3929"
    },
    "dark": {
      "background": "#101114",
      "foreground": "#f3eee6",
      "border": "#35373b",
      "card": "#1b1e23",
      "cardForeground": "#f3eee6",
      "popover": "#24282e",
      "popoverForeground": "#f3eee6",
      "primary": "#d66a4d",
      "primaryForeground": "#181512",
      "secondary": "#24282e",
      "secondaryForeground": "#f3eee6",
      "muted": "#24282e",
      "mutedForeground": "#c9c2b8",
      "accent": "#b8945f",
      "accentForeground": "#181512",
      "destructive": "#d66a5f",
      "destructiveForeground": "#181512",
      "input": "#303237",
      "ring": "#d66a4d",
      "chart1": "#d66a4d",
      "chart2": "#e0bc7f",
      "chart3": "#9b89ae",
      "chart4": "#83a8b7",
      "chart5": "#78bb8e",
      "sidebar": "#15171b",
      "sidebarForeground": "#f3eee6",
      "sidebarBorder": "#292c31",
      "sidebarPrimary": "#d66a4d",
      "sidebarPrimaryForeground": "#181512",
      "sidebarAccent": "#24282e",
      "sidebarAccentForeground": "#f3eee6",
      "sidebarRing": "#d66a4d"
    }
  },
  "fontFamily": {
    "sans": [
      "DM Sans",
      "sans-serif"
    ],
    "serif": [
      "Cormorant Garamond",
      "Georgia",
      "serif"
    ],
    "mono": [
      "DM Mono",
      "monospace"
    ]
  },
  "radius": "0.5rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
