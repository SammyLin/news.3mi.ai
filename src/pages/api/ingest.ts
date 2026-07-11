import type { APIRoute } from 'astro';
import { createArticle, getDB, updateArticle } from '../../lib/db';
import { extractExcerpt, renderMarkdown } from '../../lib/markdown';
import { fetchOgImage, generatedCoverPath } from '../../lib/ogImage';

export const prerender = false;

const getEnv = (context: any) => context.locals.runtime?.env || context.locals.cloudflare?.env || context.locals.env || {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function authorized(request: Request, expected: string | undefined) {
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('x-openclaw-key') || '';
  return token.length === expected.length && token === expected;
}

function slugify(input: string) {
  return input.toLowerCase().slice(0, 90).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `openclaw-${Date.now()}`;
}

/** Public machine-readable feed consumed by ChunkUp/OpenClaw. */
export const GET: APIRoute = async (context) => {
  const db = getDB(context);
  const result = await db.prepare(`
    SELECT slug,title,excerpt,source_url,source_type,related_chunk_url,related_chunk_title,published_at,updated_at
    FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 100
  `).all();
  return json({ version: 1, site: 'news', generated_at: new Date().toISOString(), items: result.results || [] });
};

/** Idempotent OpenClaw article ingestion, deduped by source_url then slug. */
export const POST: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!authorized(context.request, env.OPENCLAW_INGEST_KEY)) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const title = String(body.title || '').trim();
  const contentMd = String(body.content_md || body.content || '').trim();
  const sourceUrl = String(body.source_url || '').trim();
  if (!title || !contentMd || !sourceUrl) return json({ error: 'title, content_md, source_url are required' }, 400);

  const db = getDB(context);
  const slug = slugify(String(body.slug || title));
  const existing = await db.prepare('SELECT id FROM articles WHERE source_url=? OR slug=? LIMIT 1').bind(sourceUrl, slug).first() as { id: number } | null;

  // 封面圖解析：① 明確帶入 → ② 抓原文 og:image → ③ 自動產生品牌封面
  const catId = Number(body.category_id || 1);
  let cover: string | undefined = body.cover_image ? String(body.cover_image) : undefined;
  let coverSource: 'provided' | 'og-image' | 'generated' = 'provided';
  if (!cover) {
    const og = await fetchOgImage(sourceUrl);
    if (og) { cover = og; coverSource = 'og-image'; }
  }
  if (!cover) {
    const cat = await db.prepare('SELECT name, color FROM categories WHERE id = ?').bind(catId).first() as { name?: string; color?: string } | null;
    cover = generatedCoverPath({ title, color: cat?.color, label: cat?.name });
    coverSource = 'generated';
  }

  const data = {
    slug,
    title,
    excerpt: String(body.excerpt || extractExcerpt(contentMd)).slice(0, 500),
    content_md: contentMd,
    content_html: renderMarkdown(contentMd),
    cover_image: cover,
    source_url: sourceUrl,
    source_type: String(body.source_type || 'OpenClaw'),
    related_chunk_url: body.related_chunk_url ? String(body.related_chunk_url) : undefined,
    related_chunk_title: body.related_chunk_title ? String(body.related_chunk_title) : undefined,
    content_type: ['signal','deep-dive','field-note','decision-card'].includes(body.content_type) ? body.content_type : 'signal',
    decision_status: ['adopt','trial','watch','avoid'].includes(body.decision_status) ? body.decision_status : 'watch',
    impact_level: ['low','medium','high'].includes(body.impact_level) ? body.impact_level : 'medium',
    confidence: Math.min(100, Math.max(0, Number(body.confidence ?? 70))),
    event_key: body.event_key ? slugify(String(body.event_key)) : undefined,
    category_id: catId,
    status: body.status === 'draft' ? 'draft' as const : 'published' as const,
    is_featured: body.is_featured ? 1 : 0,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
  };

  // 提醒 OpenClaw：沒給真圖時退回抓 og:image 或自動產生封面。
  const warnings = coverSource === 'generated'
    ? ['未提供 cover_image 且原文無 og:image：已自動產生品牌封面。建議帶原文 og:image 以取得真實縮圖。']
    : undefined;

  if (existing) {
    await updateArticle(db, existing.id, data);
    return json({ success: true, action: 'updated', id: existing.id, slug, cover_image: cover, cover_source: coverSource, warnings });
  }
  const id = await createArticle(db, data);
  return json({ success: true, action: 'created', id, slug, cover_image: cover, cover_source: coverSource, warnings }, 201);
};
