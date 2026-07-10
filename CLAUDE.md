# news.3mi.ai

Astro site on Cloudflare Pages + D1 + R2.

## UI convention

No emoji in UI. Use lucide icons (`lucide-astro` components for static markup; inline lucide SVG for runtime-built strings — e.g. `src/lib/categoryIcon.ts` maps category slug → Lucide SVG). Emoji only allowed inside article title / article content.

Design tokens + interaction language follow the shared 3mi design system — see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) (canonical values: color, type scale, spacing, radius, shadow, easing `cubic-bezier(.32,.72,0,1)`, focus ring). Keep `src/styles/global.css` tokens in sync with it.

## Deploy

See [DEPLOY.md](./DEPLOY.md) — build then `wrangler pages deploy ./dist --project-name=news-3mi`. `wrangler login` required. `wrangler pages deploy` ships the working tree; `git stash -u` first if uncommitted WIP must not go live.
