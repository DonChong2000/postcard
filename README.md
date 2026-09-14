# Postcard

Upload a photo, get 3 styles generated at once, and pick your favorite —
a print-ready postcard front and back.
A [Next.js](https://nextjs.org) + Tailwind CSS project by [Don Chong](https://donchong.top).

The front is generated from your photo. The back is plain paper with the address lines
and message drawn over it in real text — image models cannot render legible lettering,
so nothing that has to be read is generated. A generated near-empty background can be
put behind that text with the dev panel's "Generate back too" toggle, at twice the cost. Both are
composed in the browser and downloaded for free; a file is only stored if you buy a
printed one.

A photo is picked by browsing or by dropping it anywhere on the window; generating is a
separate press, because every generation costs money. Stop and Replace undo it. Wide screens put a numbered flow rail
beside a large card stage; under 700px the card stays pinned at the top with one action
at a time and the writing moves into a bottom sheet. Either way the card is a live
preview — the message and address are typed beside it, in one of three handwriting
faces, and appear on it as you type. The preview is plain DOM over the generated images;
`src/lib/canvas.ts` composes the real PNGs only on download.

The ✨ in the corner of the message box rewrites what you wrote (`POST /api/polish`,
`gemini-flash-lite-latest`) and leaves a Revert next to it to put your own words back.

There is one size: an A5 sheet (210 x 148 mm, 2480 x 1748 px at 300dpi) that folds down
the middle into an A6 card.

## Getting Started

```bash
pnpm install
cat >> .env.local <<'EOF'
AI_GATEWAY_API_KEY=...           # Vercel AI Gateway key, for OpenAI
GOOGLE_GENERATIVE_AI_API_KEY=... # Google AI Studio key, for Gemini

# Only needed to sell; without them everything but Buy works.
STRIPE_SECRET_KEY=sk_test_...    # a sandbox key is enough for development
STRIPE_PRICE_ID=price_...        # the price, not the product
R2_ACCOUNT_ID=...
R2_BUCKET=postcard
R2_ACCESS_KEY_ID=...             # R2 > Manage API tokens, Object Read & Write
R2_SECRET_ACCESS_KEY=...
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

Every generation makes 3 styles (paper illustration, watercolor, vintage) — 3 images per
postcard, or 6 with the back turned on, so budget 3-6x those figures per generation.
The dev panel also dumps the raw model output for all three styles, before the A5 crop.
`generateImage()` in the AI SDK cannot take an input image
([vercel/ai#14044](https://github.com/vercel/ai/issues/14044)), which is why the two
providers take different paths.

`POST /api/generate?dryRun=1` returns the resolved prompts and export dimensions
without calling a model — free, and the quickest way to check prompt changes. The dev
panel's "Load sample result" fills the flow with the sample art instead of generating,
which covers the writing, preview and download paths for nothing.

Photos are downscaled to 1600px in the browser before upload — the models resample to
about 1024px anyway, so sending a 5MB original only risks a reverse-proxy size
rejection. Typical upload is under 400KB.

Every request costs money, so uploads are capped at 10MB server-side, checked by magic
bytes rather than the browser's Content-Type, and rate limited to 10 per IP per hour
(in memory, so it resets on restart).

## Buying a printed one

Buy sits next to Download rather than replacing it — the PNGs stay free. It renders the
same two faces, stores them in Cloudflare R2, and sends you to Stripe-hosted checkout,
which collects the card and the postal address. No card details reach this app.

The stored PNGs are private: the bucket is not public, and `/api/o/<key>` streams them
back through the server under a random 128-bit key. That is also the URL recorded on the
Stripe payment, which is how the print file is found later.

There is no webhook and no order database. An order is a paid payment with two image
URLs in its metadata, read from the Stripe dashboard and posted by hand. That is honest
at this volume and stops being so somewhere around a few orders a week.

Prices are immutable in Stripe — changing the amount means a new `price_...` id, and the
label on the Buy button is a hand-kept copy of it.

## Deployment

Self-hosted, deployed via GitHub Actions (`.github/workflows/deploy.yml`): lint → build → Docker build (CI validation) → SSH to the production server, which rebuilds via `docker compose up -d --build`. Pushing to `main` deploys to production.

The server needs the same environment as `.env.local` — both model keys, plus the Stripe
and R2 keys if Buy is live — in a `.env` file next to `docker-compose.yml`. The workflow
only pulls and rebuilds, so without the model keys every generation fails with a 500, and
without the Stripe and R2 keys Buy does.

Sandbox keys and live keys are separate worlds: going live means a new product, a new
`price_...`, a fresh `sk_live_...` and re-registering anything that points at Stripe.
Nothing migrates.

Live at [postcard.donchong.com](https://postcard.donchong.com).
