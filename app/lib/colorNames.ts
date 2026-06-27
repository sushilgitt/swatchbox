/**
 * Best-effort mapping from a human color/option-value name to a hex color, used
 * to prefill the swatch editor. Covers CSS named colors plus common
 * fashion/retail names. Unknown names fall back to a neutral grey.
 */
const NAMED_COLORS: Record<string, string> = {
  // neutrals
  white: "#ffffff",
  black: "#000000",
  grey: "#808080",
  gray: "#808080",
  silver: "#c0c0c0",
  charcoal: "#36454f",
  ivory: "#fffff0",
  cream: "#fffdd0",
  beige: "#f5f5dc",
  tan: "#d2b48c",
  khaki: "#c3b091",
  brown: "#8b4513",
  chocolate: "#7b3f00",
  camel: "#c19a6b",
  // reds / pinks
  red: "#ff0000",
  crimson: "#dc143c",
  maroon: "#800000",
  burgundy: "#800020",
  wine: "#722f37",
  rose: "#ff007f",
  pink: "#ffc0cb",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  coral: "#ff7f50",
  salmon: "#fa8072",
  // oranges / yellows
  orange: "#ffa500",
  rust: "#b7410e",
  peach: "#ffe5b4",
  gold: "#ffd700",
  yellow: "#ffff00",
  mustard: "#e1ad01",
  // greens
  green: "#008000",
  olive: "#808000",
  lime: "#bfff00",
  mint: "#98ff98",
  teal: "#008080",
  forest: "#228b22",
  emerald: "#50c878",
  sage: "#9caf88",
  // blues / purples
  blue: "#0000ff",
  navy: "#000080",
  royal: "#4169e1",
  "royal blue": "#4169e1",
  sky: "#87ceeb",
  "sky blue": "#87ceeb",
  turquoise: "#40e0d0",
  cyan: "#00ffff",
  aqua: "#00ffff",
  indigo: "#4b0082",
  purple: "#800080",
  violet: "#8f00ff",
  lavender: "#e6e6fa",
  plum: "#8e4585",
  denim: "#1560bd",
};

/** Normalize a value name and return a guessed hex, or a neutral fallback. */
export function guessHex(name: string, fallback = "#cccccc"): string {
  const key = name.trim().toLowerCase();
  if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  // try last word (e.g. "Heather Grey" -> "grey", "Light Blue" -> "blue")
  const words = key.split(/[\s/-]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    if (NAMED_COLORS[words[i]]) return NAMED_COLORS[words[i]];
  }
  return fallback;
}

/** True if the string already looks like a hex color. */
export function isHex(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
