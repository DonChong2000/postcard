// Shared, pure definitions. Imported by both the page (for labels) and the route
// handler (for prompts). No I/O in here so `?dryRun=1` can exercise it for free.

export type StyleKey = keyof typeof STYLES;
export type ModelKey = keyof typeof MODELS;
export type Side = "front" | "back";

const SUBJECT = "the scene in the uploaded photo";

export const STYLES = {
  paper: {
    label: "Paper illustration",
    prompt:
      `A minimal hand-drawn paper illustration of ${SUBJECT}, reinterpreting it as a ` +
      "small, quiet, handmade visual poem rather than a literal picture. Extract only " +
      "the most recognizable subject, its essential silhouette and proportions, key " +
      "pose or gesture, and any important objects — the core relationship between " +
      "them — and discard everything else. Highly simplified: delicate, slightly " +
      "imperfect hand-drawn lines; a small number of bold, clearly defined flat " +
      "acrylic-style color shapes; rough paper texture; visible handmade brush marks; " +
      "slightly irregular, organic edges; subtle imperfections that make it feel " +
      "genuinely handmade, never digitally polished. The illustrated subject is " +
      "small, centered, and carefully composed, occupying no more than 15-20% of the " +
      "canvas, surrounded by a large amount of negative space. Background is rough " +
      "white, warm off-white, or pale natural paper — minimal editorial book-cover " +
      "stock — with only a few lines or small color shapes suggesting the " +
      "surrounding environment. Compress the palette to the dominant colors pulled " +
      "from the photo, no more than 4 main colors, restrained and harmonious, used as " +
      "bold but controlled flat blocks; preserve subtle paper grain and brush " +
      "texture. No typography or lettering of any kind. The feeling is quiet, " +
      "poetic, refined, minimal, innocent, artistic, and premium — a small subject " +
      "surrounded by a large amount of empty space, like the cover of an independent " +
      "art publication rather than a commercial advertisement. Avoid colored-pencil " +
      "aesthetics, crayon textures, bleeding watercolor, pure line art, complex " +
      "realistic illustration, heavy oil-painting effects, smooth polished digital " +
      "illustration, 3D rendering or glossy 3D textures, commercial cartoon or " +
      "e-commerce aesthetics, generic poster templates, and busy or overly " +
      "decorative compositions.",
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
} as const;

// One size: an A5 sheet (210x148mm landscape) at 300dpi, folded down the middle to A6.
export const PAGE_PX = { w: 2480, h: 1748 } as const;

export const MODELS = {
  "gemini-3.1-flash-image": {
    label: "Google Gemini 3.1 Flash Image",
    id: "gemini-3.1-flash-image",
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
  " Composition constraint: keep the entire subject and all visual interest inside the " +
  "RIGHT half of the canvas; the LEFT half stays quiet and near-empty, and nothing " +
  "important crosses the vertical centre. Render this as one single continuous flat " +
  "artwork: do NOT draw a fold, crease, seam, gutter, divider, frame, panel edge or any " +
  "line down the middle, and do not show it as a folded card, book or brochure.";

const FOLD_BACK_SUFFIX =
  " Keep the left and right halves equally empty and let no motif cross the vertical " +
  "centre, but render one single continuous flat surface: no fold, crease, seam, " +
  "gutter, divider or line down the middle.";

export function buildPrompt(style: StyleKey, side: Side): string {
  let p: string = STYLES[style].prompt;
  if (side === "back") p += BACK_SUFFIX;
  p += side === "front" ? FOLD_FRONT_SUFFIX : FOLD_BACK_SUFFIX;
  return p;
}

export function isKey<T extends object>(map: T, k: unknown): k is keyof T {
  return typeof k === "string" && k in map;
}
