// Pure, best-effort mapping from a SanMar/apparel color NAME to an
// approximate display swatch color. No color hex value is stored
// anywhere in this schema (product_variants.color_name is free text,
// e.g. "Athletic Heather", "True Navy") -- this is a deliberately
// small, static lookup for common names, not an attempt at an exact
// match to the real garment color. Task wording is "display swatches
// OR color names where available" -- this never blocks rendering the
// color name itself; a swatch is purely an enhancement layered on top.
// No Supabase/network dependency -- see
// scripts/verifyColorSwatchLogic.ts.

const KNOWN_COLOR_SWATCHES: Record<string, string> = {
  black: "#1a1a1a",
  white: "#ffffff",
  navy: "#1b2a4a",
  "true navy": "#1b2a4a",
  red: "#c8102e",
  "true red": "#c8102e",
  maroon: "#5e2129",
  royal: "#1d4f91",
  "royal blue": "#1d4f91",
  "light blue": "#9cc3e5",
  carolina: "#7ba4db",
  "carolina blue": "#7ba4db",
  green: "#1e5631",
  "forest green": "#1e5631",
  kelly: "#2e8b57",
  "kelly green": "#2e8b57",
  orange: "#e4762c",
  "safety orange": "#ff6600",
  yellow: "#f2d230",
  gold: "#b8860b",
  purple: "#5b3a7a",
  grey: "#8a8d8f",
  gray: "#8a8d8f",
  "athletic heather": "#9a9a9d",
  "sport grey": "#a7a8aa",
  "sport gray": "#a7a8aa",
  charcoal: "#36454f",
  "dark heather": "#555555",
  pink: "#eb9fb5",
  "light pink": "#f4c2cf",
  heliconia: "#da3a7a",
  brown: "#5a3825",
  tan: "#c2a36b",
  khaki: "#bfb28f",
  cardinal: "#8c1d2c",
  burgundy: "#5e2129",
  teal: "#287c7c",
  turquoise: "#30c8c8",
  "sand": "#c2b280",
  "stone": "#b0a999",
  camo: "#5f6b3a",
  "realtree xtra": "#5f6b3a",
};

export function getColorSwatchHex(colorName: string): string | null {
  const key = colorName.trim().toLowerCase();
  return KNOWN_COLOR_SWATCHES[key] ?? null;
}
