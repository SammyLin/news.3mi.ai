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
    SELECT slug,title,excerpt,source_url,source_type,authorship,related_chunk_url,related_chunk_title,published_at,updated_at
    FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 100
  `).all();
  return json({ version: 1, site: 'news', generated_at: new Date().toISOString(), items: result.results || [] });
};

/** Idempotent OpenClaw article ingestion, deduped by source_url then slug. */
export const POST: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!authorized(context.request, env.OPENCLAW_NEWS_INGEST_KEY || env.OPENCLAW_INGEST_KEY)) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const title = String(body.title || '').trim();
  const contentMd = String(body.content_md || body.content || '').trim();
  const sourceUrl = String(body.source_url || '').trim();
  if (!title || !contentMd || !sourceUrl) return json({ error: 'title, content_md, source_url are required' }, 400);
  if (!/^https?:\/\//i.test(sourceUrl)) return json({ error: 'source_url must be an http(s) URL' }, 400);

  // 原始發佈日(搬舊文用):ISO 8601,無效值忽略、不擋件
  const publishedAt = typeof body.published_at === 'string' && !Number.isNaN(Date.parse(body.published_at))
    ? new Date(body.published_at).toISOString()
    : undefined;

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
    related_chunk_url: body.related_chunk_url && /^https?:\/\//i.test(String(body.related_chunk_url).trim())
      ? String(body.related_chunk_url).trim()
      : undefined,
    related_chunk_title: body.related_chunk_title ? String(body.related_chunk_title) : undefined,
    content_type: ['signal','deep-dive','field-note','decision-card'].includes(body.content_type) ? body.content_type : 'signal',
    authorship: ['original','ai','translation'].includes(body.authorship) ? body.authorship : 'ai',
    // 產製來源(admin-only,前台不顯示):誰送進來的 + 用什麼模型寫的 + 呼叫端 IP(server 自抓,非 payload 欄位)
    // created_via 不預設值——多個 agent 共用這支 API(hermes-agent / openclaw / claude-code / codex),猜了會誤標
    created_via: body.created_via || body.agent ? String(body.created_via || body.agent).slice(0, 100) : undefined,
    gen_model: body.gen_model || body.model ? String(body.gen_model || body.model).slice(0, 100) : undefined,
    ingest_ip: context.request.headers.get('cf-connecting-ip') || undefined,
    decision_status: ['adopt','trial','watch','avoid'].includes(body.decision_status) ? body.decision_status : 'watch',
    impact_level: ['low','medium','high'].includes(body.impact_level) ? body.impact_level : 'medium',
    confidence: Math.min(100, Math.max(0, Number(body.confidence ?? 70))),
    event_key: body.event_key ? slugify(String(body.event_key)) : undefined,
    category_id: catId,
    status: body.status === 'draft' ? 'draft' as const : 'published' as const,
    published_at: publishedAt,
    // is_featured / is_pinned 是編輯位（今日觀點 / 置頂），只能在 /admin 設定——
    // ingest 不寫入，避免 pipeline 佔首頁主位、re-ingest 洗掉山米勾的旗標。
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
  };

  // 提醒 OpenClaw：沒給真圖時退回抓 og:image 或自動產生封面；沒報模型時提醒補。
  const warningList: string[] = [];
  if (coverSource === 'generated') warningList.push('未提供 cover_image 且原文無 og:image：已自動產生品牌封面。建議帶原文 og:image 以取得真實縮圖。');
  if (body.published_at && !publishedAt) warningList.push('published_at 格式無效（需 ISO 8601，如 2013-05-01 或 2013-05-01T08:00:00Z），已忽略、改用預設時間。');
  if (!data.created_via) warningList.push('未提供 created_via：請帶送件 agent 名稱（hermes-agent / openclaw / claude-code / codex…），供 admin 追蹤產製來源。');
  if (!data.gen_model) warningList.push('未提供 gen_model：請在 payload 帶產文模型 id（如 claude-sonnet-5），供 admin 追蹤產製來源。');
  const warnings = warningList.length ? warningList : undefined;

  if (existing) {
    await updateArticle(db, existing.id, data);
    return json({ success: true, action: 'updated', id: existing.id, slug, cover_image: cover, cover_source: coverSource, warnings });
  }
  const id = await createArticle(db, data);
  return json({ success: true, action: 'created', id, slug, cover_image: cover, cover_source: coverSource, warnings }, 201);
};
