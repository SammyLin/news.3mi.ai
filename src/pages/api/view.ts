import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';

export const prerender = false;

/** 增加文章瀏覽數。公開端點（無需登入），只對已發佈文章 +1。 */
export const POST: APIRoute = async (context) => {
  try {
    const db = getDB(context);
    const url = new URL(context.request.url);
    const slug = url.searchParams.get('slug');
    if (!slug) {
      return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 });
    }

    const result = await db
      .prepare(`UPDATE articles SET view_count = view_count + 1 WHERE slug = ? AND status = 'published'`)
      .bind(slug)
      .run();

    return new Response(JSON.stringify({ ok: (result.meta?.changes ?? 0) > 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('view POST error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
