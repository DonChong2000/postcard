# Postcard

A [Next.js](https://nextjs.org) + Tailwind CSS project by [Don Chong](https://donchong.top).

## Getting Started

```bash
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deployment

Self-hosted, deployed via GitHub Actions (`.github/workflows/deploy.yml`): lint → build → Docker build (CI validation) → SSH to the production server, which rebuilds via `docker compose up -d --build`. Pushing to `main` deploys to production.

Live at [postcard.donchong.com](https://postcard.donchong.com).
