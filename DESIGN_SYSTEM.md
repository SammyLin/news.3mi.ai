# 3mi Design System (canonical)

One visual language across all three products — **3mi.ai** (portfolio, Astro+Tailwind), **news.3mi.ai** (news/reading, Astro+vanilla CSS), **ChunkUp** (learning app, vanilla static). Layouts differ per product; **tokens + interaction language are shared**. Feel: warm, calm, trustworthy, focused. Motion gives feedback, never competes with content. Fixed light palette (no system dark auto-switch).

Each repo mirrors these token VALUES in its own token layer (Tailwind `@theme` / CSS `:root` / DS vars). Names may stay per-repo; values must match.

## Color

| Role | Value |
| --- | --- |
| canvas (page bg) | `#faf8f5` |
| surface (card/input) | `#ffffff` |
| surface-subtle | `#f5f3ef` |
| border (hairline) | `#f0ece5` |
| border-strong | `#e7e5e4` |
| text | `#292524` |
| text-secondary | `#57534e` |
| text-muted | `#a8a29e` |
| brand (gold) | `#ca8a04` |
| brand-hover | `#a16207` |
| brand-subtle | `#fef9c3` |
| brand-light | `#facc15` |
| action (primary btn) | `#292524` |
| action-hover | `#ca8a04` |
| on-action | `#faf8f5` |
| success | `#15803d` |
| danger | `#b91c1c` |

Status colors express state only. Category/context colors are for dots + thin edges, never replace the brand.

## Typography

- Stack: `Noto Sans TC` → `jf-open-huninn` → platform system font.
- Smoothing: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`.
- Display: `clamp(2.35rem, 6vw, 3.65rem)`, line-height `1.05`, tracking `-0.03em` (up to `-0.048em` on the largest hero).
- Page title (h1): line-height `1.1`, tracking `-0.03em`.
- Heading (h2–h4): tracking `-0.02em`, line-height `1.12`.
- Body: line-height `1.62` (Latin) / `1.75–1.85` (CJK article reading). `text-wrap: balance` on headings, `pretty` on paragraphs.
- Labels: small caps / uppercase may use positive tracking. Never force fixed tracking on all body text (hurts CJK).

## Spacing & shape

- Spacing scale: `4, 8, 12, 16, 24, 32, 48`px (8pt grid).
- Radius: sm `10px`, md `16px`, lg `22px`, pill `999px`.
- Reading measure 55–68ch; main content max ~960px.
- Same-group controls 8–12px apart; sections 24–48px.

## Depth (shadow) — layered, low-opacity, brown ink

```
--shadow-sm: 0 1px 2px rgba(41,37,36,.04);
--shadow-md: 0 1px 2px rgba(41,37,36,.04), 0 8px 24px rgba(41,37,36,.06);
--shadow-lg: 0 2px 6px rgba(41,37,36,.05), 0 18px 40px rgba(41,37,36,.10);
```

Cards rest on `--shadow-sm/md`, lift to the next level on hover. Never heavy generic shadows.

## Motion & interaction

- Standard easing (canonical): `--ease: cubic-bezier(.32,.72,0,1)`. Secondary utility easing: `--ease-standard: cubic-bezier(.4,0,.2,1)`.
- Durations: fast `140ms`, base `220ms`, slow `320ms`.
- Pointer-down press: scale `0.97`, ~100ms.
- State changes: 200–320ms, animate only `transform` / `opacity` / color.
- Card hover: `translateY(-3px)` + shadow step-up, ~220–280ms.
- Large material entrance: ~480ms, scale `0.985` + translateY `8px` (+ optional blur `5px`).
- No overshoot/bounce on menus or cards.
- `prefers-reduced-motion: reduce`: drop translate + entrance animations (keep content visible); keep only very short color/opacity changes.

## Components

- Primary button: brown fill, cream text, hover → gold, min height 38px.
- Secondary button: surface fill + border; gold only on hover.
- Card: surface, md/lg radius, thin border + soft shadow.
- Material bar: ~72% surface + 22px blur + saturation; `prefers-reduced-transparency` → solid fallback.
- Focus (all interactive elements): `:focus-visible` → 2px brand outline, `outline-offset: 2px` (or 3px brand @22% ring). Keyboard focus must always be visible.
- Icons: inline Lucide only, `stroke="currentColor"`. **No emoji** anywhere in UI (article title/content authored by users excepted).

## Accessibility

- Fixed light palette; honor reduced-motion, reduced-transparency, increased-contrast.
- Touch targets ≥38px (primary 44–48px).
- Color is never the only state cue — pair with text or a Lucide icon.
