# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
pnpm run dev      # dev server on :3000 (dev-only UI is gated on NODE_ENV)
pnpm run lint     # eslint — CI runs this before build
pnpm run build    # next build, output: "standalone" (Docker needs it)
pnpm start        # serves the build on :3002, the port docker-compose maps
```

No test runner and no tests. The checks that exist are `lint`, `build`, and
`POST /api/generate?dryRun=1` (form fields `style` + `model`), which returns the resolved
prompts and export size without spending money on a model call. Every real generation
costs $0.06-$0.60, so use `dryRun` for anything prompt-shaped.

`.env.local` needs `GOOGLE_GENERATIVE_AI_API_KEY` (Gemini) and `AI_GATEWAY_API_KEY` (OpenAI
via Vercel AI Gateway). Selling needs six more: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and
`R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`. Without them the
app still generates and downloads — only Buy 500s.

Push to `main` deploys: lint → build → docker build → SSH + `docker compose up -d --build`.

## Architecture

Five files do the postcard, three more sell it, two more front it. The split exists so the
money-spending part is small and the free parts are testable by eye.

`/` is the landing page and `/app` is the maker; anything linking a buyer back to the tool
(the success page, Stripe's `cancel_url`) has to say `/app`, not `/`.

- **`src/lib/postcard.ts`** — pure data, no I/O: the 3 style prompts, the two model
  entries, `PAGE_PX` (2480x1748 = A5 at 300dpi), and `buildPrompt(style, side)` which
  appends the back/fold suffixes. Imported by both the client and the route, which is why
  `dryRun` can exercise the whole prompt path for free. Prompt edits belong here only.
- **`src/app/api/generate/route.ts`** — one POST per style (the client fires 3 in
  parallel), front and back in a `Promise.all`. Two provider paths, deliberately:
  Gemini goes direct through `@ai-sdk/google` `generateText` with `responseModalities:
  ["IMAGE"]` and a retry (it sometimes answers in prose), OpenAI goes through the gateway's
  `/v1/images/edits` because the AI SDK's `generateImage()` cannot take an input image
  ([vercel/ai#14044](https://github.com/vercel/ai/issues/14044)). Returns data: URLs.
  Guards before any spend: 10MB cap, magic-byte sniff (not Content-Type), 10/IP/hour
  in-memory.
- **`src/app/api/polish/route.ts`** — the ✨ in the message box. One `generateText` call
  on `gemini-flash-lite-latest`, plain text in and out, no rate limit of its own.
- **`src/app/app/page.tsx`** — the whole maker UI, one client component. Picking a photo
  (browse, or a drop anywhere on the window) only loads it; "Generate the card" is what
  spends money, and Stop/Replace undo it. The card preview is plain DOM
  over the returned images, both faces are `@container`s sized in `cqw`, so one component
  serves the 780px desktop card and the 358px phone one. Under 700px the layout swaps to
  a pinned card + bottom sheet. Uploads are downscaled to 1600px client-side by `shrink()`.
- **`src/lib/canvas.ts`** — browser-only, runs at download time only. Crops the generated
  art to A5 with `cover()` and draws address lines, message and divider as **real canvas
  text**. Nothing that has to be legible is ever generated — image models cannot render
  lettering. Keep it that way.

The back is opt-in (dev panel "Generate back too") because it doubles the cost; without
it the back is plain paper with text drawn on it. The dev panel also loads the sample art
as a fake result (free, exercises steps 3-4) and dumps the raw model output for all three
styles.

### Landing

- **`src/app/page.tsx`** — one screen: wordmark, headline, sentence, CTA to `/app`, and a
  card. A server component; only the card is client. The designer cut the how-it-works
  steps, outcome band, footer and price line. Don't reintroduce them.
- **`src/app/SampleCard.tsx`** — the flipping example card, a trimmed copy of the maker's
  `Card` rather than a shared component. Read the `ponytail:` comment before merging them.

### Selling

Buy sits beside Download and never replaces it — the file stays free. It renders the same two
canvases, uploads both, and hands off to Stripe-hosted checkout; nothing about cards or
payment touches this codebase.

- **`src/app/api/o/[[...key]]/route.ts`** — the object store, both halves in one file because
  they share the R2 client and the key format. POST sniffs PNG magic bytes and mints a random
  key; GET proxies the bytes back rather than making the bucket public, so customers' photos
  stay private and there is no DNS to own. Signing is `aws4fetch` (64KB) rather than
  `@aws-sdk/client-s3` (~20MB). R2 rejects a chunked PUT — `content-length` is not optional.
- **`src/app/api/checkout/route.ts`** — one Checkout Session. Takes both face URLs and refuses
  any it did not mint, because that metadata is what a print job later downloads. The amount
  comes from `STRIPE_PRICE_ID`, never the browser. Metadata goes on the session **and** the
  PaymentIntent: Stripe copies neither to the other, the webhook sees the first and the
  dashboard's Payments page shows the second.
- **`src/app/success/page.tsx`** — server component, reads the session id Stripe substitutes
  into `success_url` and shows the real total and destination. No id is not an error; it falls
  back to a plain thank-you.

There is no webhook and no order database. Fulfilment is reading the dashboard and posting a
card. Add a webhook when doing that by hand stops being tolerable, not before.

`src/instrumentation.ts` routes Node's fetch through `HTTPS_PROXY` when set — local dev
only, no-op in production.

## Conventions

- Comments here explain *why*, especially where the code looks wrong but isn't (the Gemini
  retry, the non-JSON response check, the abort-signal guard in `generate()`'s `finally`).
  Match that; don't add comments that restate the code.
- `// ponytail:` marks a deliberate shortcut with its ceiling named. Don't "fix" one
  without reading it.
- Dev-only UI is gated on `const DEV = process.env.NODE_ENV === "development"`, not a
  separate build.
