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
via Vercel AI Gateway). Push to `main` deploys: lint → build → docker build → SSH +
`docker compose up -d --build`.

## Architecture

Four files do everything. The split exists so the money-spending part is small and the
free parts are testable by eye.

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
- **`src/app/page.tsx`** — the whole UI, one client component. Picking a photo *is* the
  generate action (no confirm step; Stop/Replace undo it). The card preview is plain DOM
  over the returned images, both faces are `@container`s sized in `cqw`, so one component
  serves the 780px desktop card and the 358px phone one. Under 700px the layout swaps to
  a pinned card + bottom sheet. Uploads are downscaled to 1600px client-side by `shrink()`.
- **`src/lib/canvas.ts`** — browser-only, runs at download time only. Crops the generated
  art to A5 with `cover()` and draws address lines, message and divider as **real canvas
  text**. Nothing that has to be legible is ever generated — image models cannot render
  lettering. Keep it that way.

The back is opt-in (dev panel "Generate back too") because it doubles the cost; without
it the back is plain paper with text drawn on it.

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
