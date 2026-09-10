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
  gouache: {
    label: "Gouache",
    prompt:
      `A minimalist editorial gouache illustration of ${SUBJECT} on warm off-white ` +
      "textured paper. A restrained, handcrafted illustration aesthetic inspired by " +
      "contemporary editorial print design, translating the subject into simplified, " +
      "flat-painted shapes while preserving its recognizable silhouette and important " +
      "structural features. Warm ivory background with subtle natural paper grain and " +
      "fibrous texture; matte gouache paint appearance with visible dry-brush texture " +
      "and slightly uneven pigment coverage. Simplified geometric shapes and blocky " +
      "forms with clean but imperfect hand-painted edges. Limited muted color palette " +
      "with a few strong accent colors, soft desaturated secondary colors. No " +
      "gradients or glossy digital rendering, no photorealism, no 3D-rendered " +
      "appearance. Subtle overlap between painted shapes and small imperfections that " +
      "make it feel physically illustrated — an understated editorial, museum-catalog " +
      "aesthetic. Generous negative space around the subject, which is centered or " +
      "carefully balanced within the composition, with a soft sparse painted shadow " +
      "beneath it. People, if present, are mostly featureless or minimally detailed, " +
      "with facial features omitted or reduced to extremely simple marks; realistic " +
      "proportions but simplified anatomy, preserving recognizable detail through " +
      "silhouette, color blocks, and a few key lines rather than fine detail. Minimal " +
      "ink-like outlines: thin, slightly irregular hand-drawn lines only where " +
      "necessary, no heavy cartoon outlines — structural detail indicated with simple " +
      "painted shapes and sparse linework. Clean editorial poster composition: the " +
      "isolated subject sits against an almost empty paper background with strong " +
      "visual hierarchy, large areas of negative space, no unnecessary environmental " +
      "details, and only a subtle grounding shadow — calm, sophisticated, collectible " +
      "art-print feeling. Tactile cold-press, fine-grain paper texture with slightly " +
      "mottled gouache pigment, subtle edge feathering, and tiny variations in opacity " +
      "and brush coverage — a scanned traditional illustration feeling, NOT a clean " +
      "vector illustration. Overall: quiet, nostalgic, handcrafted, modern editorial " +
      "illustration — a museum exhibition print or art-book plate, understated and " +
      "premium.",
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
