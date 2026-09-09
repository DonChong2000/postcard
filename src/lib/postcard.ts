// Shared, pure definitions. Imported by both the page (for labels) and the route
// handler (for prompts). No I/O in here so `?dryRun=1` can exercise it for free.

export type StyleKey = keyof typeof STYLES;
export type SizeKey = keyof typeof SIZES;
export type ModelKey = keyof typeof MODELS;
export type Side = "front" | "back";

const SUBJECT = "the scene in the uploaded photo";

export const STYLES = {
  vintage: {
    label: "Vintage travel poster",
    prompt:
      `A minimalist vintage travel poster of ${SUBJECT}, vector screen print style, ` +
      "flat 2D graphic illustration. Strict 3-color palette: off-white/cream paper " +
      "background, deep navy blue (#1D3557), and muted vermilion red-orange (#E63946). " +
      "Extremely clean composition with abundant negative space where the cream " +
      "background dominates over 60% of the canvas. Sharp geometric vector outlines and " +
      "flat silhouettes, no gradients, no photorealism, no 3D shading.",
  },
  polygon: {
    label: "Low-poly polygon",
    prompt:
      `A low-poly polygon illustration of ${SUBJECT}, geometric vector art built ` +
      "entirely from flat-shaded triangular facets. Every facet is one solid colour " +
      "meeting its neighbours at a hard edge, forming a faceted crystalline mosaic of " +
      "the subject. Limited palette of 8-10 flat tones sampled from the photo. No " +
      "gradients within a facet, no texture, no outlines, no photorealism, no 3D " +
      "shading or lighting. Clean composition; the subject still reads clearly as a " +
      "silhouette at a glance.",
  },
} as const;

// Both sizes print on the same A6 sheet (148x105mm landscape) at 300dpi. They differ
// only in how the sheet is folded and therefore how the back is laid out.
export const SIZES = {
  standard: {
    label: "Standard postcard — A6, 148 x 105 mm",
    px: { w: 1748, h: 1240 },
    fold: false,
  },
  foldable: {
    label: "Foldable postcard — A6 sheet folded to A7, 74 x 105 mm",
    px: { w: 1748, h: 1240 },
    fold: true,
  },
} as const;

export const MODELS = {
  "gemini-3.1-flash-image": {
    label: "Google Gemini 3.1 Flash Image",
    id: "google/gemini-3.1-flash-image",
    provider: "google",
  },
  "gpt-image-2.5-flare": {
    label: "OpenAI GPT Image 2.5 Flare",
    id: "openai/gpt-image-2.5-flare",
    provider: "openai",
  },
} as const;

// The back is written on by hand, so the generated layer has to stay out of the way.
const BACK_SUFFIX =
  " IMPORTANT: this is the BACK of a postcard, meant to be written on. Produce an " +
  "almost empty field: no subject, no focal point, no people, no buildings, and " +
  "absolutely no text, letters, numbers or lettering of any kind. Only a very faint, " +
  "low-contrast decorative treatment confined to the outer edges — small corner motifs " +
  "or a thin border at most. At least 90% of the canvas must be plain, unbroken, pale " +
  "background with nothing on it, light enough that handwriting in dark ink stays " +
  "perfectly legible on top.";

const FOLD_FRONT_SUFFIX =
  " Composition constraint: this artwork prints on a sheet that is folded vertically " +
  "down the exact centre. Keep the entire subject and all visual interest in the RIGHT " +
  "half of the canvas — that half becomes the front cover. The LEFT half must stay " +
  "quiet and near-empty. Nothing important may cross the vertical centre line.";

const FOLD_BACK_SUFFIX =
  " The sheet folds vertically down the exact centre; keep both halves equally empty " +
  "and let no motif cross the centre line.";

export function buildPrompt(style: StyleKey, size: SizeKey, side: Side): string {
  let p: string = STYLES[style].prompt;
  if (side === "back") p += BACK_SUFFIX;
  if (SIZES[size].fold) p += side === "front" ? FOLD_FRONT_SUFFIX : FOLD_BACK_SUFFIX;
  return p;
}

export function isKey<T extends object>(map: T, k: unknown): k is keyof T {
  return typeof k === "string" && k in map;
}
