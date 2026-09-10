# Postcard

Upload a photo, get 3 styles generated at once, and pick your favorite —
a print-ready postcard front and back.
A [Next.js](https://nextjs.org) + Tailwind CSS project by [Don Chong](https://donchong.top).

The front is generated from your photo. The back is plain paper with the address lines
and message drawn over it in real text — image models cannot render legible lettering,
so nothing that has to be read is generated. A generated near-empty background can be
put behind that text with the dev panel's "Generate back too" toggle, at twice the cost. Both are
composed and downloaded in the browser; nothing is stored.

Picking a photo starts the generation immediately — there is no confirm step, and the
commitment is undone with Stop or Replace instead. Wide screens put a numbered flow rail
beside a large card stage; under 700px the card stays pinned at the top with one action
at a time and the writing moves into a bottom sheet. Either way the card is a live
preview — the message and address are typed beside it, in one of three handwriting
faces, and appear on it as you type. The preview is plain DOM over the generated images;
`src/lib/canvas.ts` composes the real PNGs only on download.

There is one size: an A5 sheet (210 x 148 mm, 2480 x 1748 px at 300dpi) that folds down
the middle into an A6 card.

## Getting Started

```bash
pnpm install
cat >> .env.local <<'EOF'
AI_GATEWAY_API_KEY=...          # Vercel AI Gateway key, for OpenAI
GOOGLE_GENERATIVE_AI_API_KEY=... # Google AI Studio key, for Gemini
EOF
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Image generation

The model is picked in the dev panel at the foot of the flow rail, which only renders
in development:

| Model | Path | Cost per image |
|---|---|---|
| `gemini-3.1-flash-image` | Google API directly via `@ai-sdk/google`, `generateText` with image-only response modality | ~$0.10 at 2K |
| `openai/gpt-image-2.5-flare` | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), OpenAI-compatible `/v1/images/edits` | ~$0.02 |

Gemini goes straight to Google (not through the gateway) so it authenticates with your
own project's key and billing rather than the gateway's routing, which otherwise
resolves `google/*` models to Vertex.

Every generation makes 3 styles (vintage, watercolor, paper illustration) — 3 images per
postcard, or 6 with the back turned on, so budget 3-6x those figures per generation.
The dev panel also dumps the raw model output for all three styles, before the A5 crop.
`generateImage()` in the AI SDK cannot take an input image
([vercel/ai#14044](https://github.com/vercel/ai/issues/14044)), which is why the two
providers take different paths.

`POST /api/generate?dryRun=1` returns the resolved prompts and export dimensions
without calling a model — free, and the quickest way to check prompt changes.

Photos are downscaled to 1600px in the browser before upload — the models resample to
about 1024px anyway, so sending a 5MB original only risks a reverse-proxy size
rejection. Typical upload is under 400KB.

Every request costs money, so uploads are capped at 10MB server-side, checked by magic
bytes rather than the browser's Content-Type, and rate limited to 10 per IP per hour
(in memory, so it resets on restart).

## Deployment

Self-hosted, deployed via GitHub Actions (`.github/workflows/deploy.yml`): lint → build → Docker build (CI validation) → SSH to the production server, which rebuilds via `docker compose up -d --build`. Pushing to `main` deploys to production.

The server needs `AI_GATEWAY_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` in a `.env`
file next to `docker-compose.yml`; the workflow only pulls and rebuilds, so without
them every generation fails with a 500.

Live at [postcard.donchong.com](https://postcard.donchong.com).
