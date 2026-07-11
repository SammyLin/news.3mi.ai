// Card thumbnail helper. Every feed card gets a thumbnail: either the article's
// cover_image, or a category-color gradient block watermarked with the category's
// Lucide icon (no emoji). Reused across all client-rendered feeds.
import { categoryIconSvg } from './categoryIcon';

function escapeUrl(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface CoverArticle {
  cover_image?: string | null;
  category?: { slug?: string | null; color?: string | null } | null;
}

/** HTML string for a card thumbnail box. Falls back to a category-color gradient watermark. */
export function coverThumb(article: CoverArticle, className = 'card-thumb'): string {
  const cover = article?.cover_image;
  if (cover) {
    return `<div class="${className}"><img src="${escapeUrl(cover)}" alt="" loading="lazy"></div>`;
  }
  const color = article?.category?.color || '#ca8a04';
  const icon = categoryIconSvg(article?.category?.slug, 44);
  return `<div class="${className} card-thumb-fallback" style="--c:${escapeUrl(color)}">${icon}</div>`;
}
