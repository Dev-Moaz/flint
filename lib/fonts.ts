import { Inter, Newsreader } from "next/font/google";

// Same pairing and same CSS variable names as the homepage,
// so both pages can share one set of font files.
export const serif = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--lk-serif",
  display: "swap",
});

export const sans = Inter({
  subsets: ["latin"],
  variable: "--lk-sans",
  display: "swap",
});