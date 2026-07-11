import type { APIRoute } from 'astro';
import { buildCoverSvg } from '../../lib/ogImage';

export const prerender = false;

/** 動態產生品牌封面 SVG。cover_image 沒真圖時用這個。 */
export const GET: APIRoute = async (context) => {
  const url = new URL(context.request.url);
  const title = url.searchParams.get('title') || 'news.3mi.ai';
  const color = url.searchParams.get('color') || '#ca8a04';
  const label = url.searchParams.get('label') || '';

  const svg = buildCoverSvg({ title, color, label });
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
