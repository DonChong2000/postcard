# Postcard

Upload a photo, get 3 styles generated at once, and pick your favorite —
a print-ready postcard front and back.
A [Next.js](https://nextjs.org) + Tailwind CSS project by [Don Chong](https://donchong.top).

The front is generated from your photo. The back is a generated near-empty background
with the address lines and message drawn over it in real text — image models cannot
render legible lettering, so nothing that has to be read is generated. Both are
composed and downloaded in the browser; nothing is stored.

The card flips between front and back on screen, and the message and address are typed
directly on it in one of three handwriting faces. The preview is plain DOM over the
generated images; `src/lib/canvas.ts` composes the real PNGs only on download.

There is one size: an A5 sheet (210 x 148 mm, 2480 x 1748 px at 300dpi) that folds down
the middle into an A6 card.

## Getting Started

```bash
pnpm install
echo "AI_GATEWAY_API_KEY=..." > .env.local   # Vercel AI Gateway key
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Image generation

Runs through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). The model is
picked in the dev panel at the bottom of the page:

| Model | Path | Cost per image |
|---|---|---|
| `google/gemini-3.1-flash-image` | `generateText`, image-only response modality | ~$0.10 at 2K |
| `openai/gpt-image-2.5-flare` | OpenAI-compatible `/v1/images/edits` | ~$0.02 |

Every generation makes 3 styles (vintage, watercolor, gouache), front + back each — 6
images per postcard, so budget roughly 6x those figures per generation.
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

The server needs `AI_GATEWAY_API_KEY` in a `.env` file next to `docker-compose.yml`;
the workflow only pulls and rebuilds, so without it every generation fails with a 500.

Live at [postcard.donchong.com](https://postcard.donchong.com).
