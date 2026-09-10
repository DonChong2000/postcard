// Shared, pure definitions. Imported by both the page (for labels) and the route
// handler (for prompts). No I/O in here so `?dryRun=1` can exercise it for free.

export type StyleKey = keyof typeof STYLES;
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
  watercolor: {
    label: "Watercolor",
    prompt:
      `A traditional watercolor painting of ${SUBJECT}, soft translucent washes of ` +
      "pigment on visibly textured cold-press paper. Loose, confident brushwork with " +
      "gentle bleeding and pooling at the edges of each wash, occasional un-painted " +
      "paper showing through as highlights. Muted, harmonious palette. No hard vector " +
      "outlines, no photorealism, no digital airbrushing — colour should look wet and " +
      "hand-painted.",
  },
  oil: {
    label: "Oil painting",
    prompt:
      `A classical oil painting of ${SUBJECT}, rendered with thick, visible ` +
      "brushstrokes and impasto texture built up on canvas. Rich, saturated colour " +
      "mixed wet-on-wet, warm painterly light and soft shadow modelling. No flat vector " +
      "shapes, no photorealism, no smooth digital gradients — the surface should read " +
      "as physical paint.",
  },
} as const;

// One size: an A5 sheet (210x148mm landscape) at 300dpi, folded down the middle to A6.
export const PAGE_PX = { w: 2480, h: 1748 } as const;

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

export function buildPrompt(style: StyleKey, side: Side): string {
  let p: string = STYLES[style].prompt;
  if (side === "back") p += BACK_SUFFIX;
  p += side === "front" ? FOLD_FRONT_SUFFIX : FOLD_BACK_SUFFIX;
  return p;
}

export function isKey<T extends object>(map: T, k: unknown): k is keyof T {
  return typeof k === "string" && k in map;
}
