// D1 database wrapper
// Cloudflare Pages Functions context 透過 request context 取得 binding
// Astro SSG build time 透過 platformProxy 模擬

export type D1Database = any; // 型別簡化，實作來自 @cloudflare/workers-types

export interface Article {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string;
  content_html: string | null;
  cover_image: string | null;
  source_url: string | null;
  source_type: string | null;
  category_id: number | null;
  status: 'draft' | 'published';
  is_featured: number;
  view_count: number;
  reading_time: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  sort_order: number;
}

export interface Tag {
  id: number;
  slug: string;
  name: string;
}

export interface ArticleWithMeta extends Article {
  category: Category | null;
  tags: Tag[];
}

/** 取得發佈文章列表（依發布時間倒序） */
export async function listPublishedArticles(
  db: D1Database,
  opts: { categorySlug?: string; tagSlug?: string; limit?: number; offset?: number } = {}
): Promise<ArticleWithMeta[]> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let sql = `
    SELECT a.*, c.id as c_id, c.slug as c_slug, c.name as c_name,
           c.description as c_description, c.color as c_color, c.icon as c_icon, c.sort_order as c_sort_order
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.status = 'published'
  `;
  const params: any[] = [];

  if (opts.categorySlug) {
    sql += ` AND c.slug = ?`;
    params.push(opts.categorySlug);
  }
  if (opts.tagSlug) {
    sql += ` AND a.id IN (SELECT at.article_id FROM article_tags at JOIN tags t ON at.tag_id = t.id WHERE t.slug = ?)`;
    params.push(opts.tagSlug);
  }

  sql += ` ORDER BY a.published_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await db.prepare(sql).bind(...params).all();

  const articleIds = (result.results as any[]).map((r) => r.id);
  const tagsMap = await getTagsForArticles(db, articleIds);

  return (result.results as any[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    content_md: r.content_md,
    content_html: r.content_html,
    cover_image: r.cover_image,
    source_url: r.source_url,
    source_type: r.source_type,
    category_id: r.category_id,
    status: r.status,
    is_featured: r.is_featured,
    view_count: r.view_count,
    reading_time: r.reading_time,
    published_at: r.published_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    category: r.c_id ? {
      id: r.c_id,
      slug: r.c_slug,
      name: r.c_name,
      description: r.c_description,
      color: r.c_color,
      icon: r.c_icon,
      sort_order: r.c_sort_order,
    } : null,
    tags: tagsMap.get(r.id) || [],
  }));
}

/** 取得焦點文章 */
export async function getFeaturedArticle(db: D1Database): Promise<ArticleWithMeta | null> {
  const result = await db.prepare(`
    SELECT a.*, c.id as c_id, c.slug as c_slug, c.name as c_name,
           c.description as c_description, c.color as c_color, c.icon as c_icon, c.sort_order as c_sort_order
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.status = 'published' AND a.is_featured = 1
    ORDER BY a.published_at DESC
    LIMIT 1
  `).first();

  if (!result) return null;

  const tagsMap = await getTagsForArticles(db, [result.id]);
  const r = result as any;

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    content_md: r.content_md,
    content_html: r.content_html,
    cover_image: r.cover_image,
    source_url: r.source_url,
    source_type: r.source_type,
    category_id: r.category_id,
    status: r.status,
    is_featured: r.is_featured,
    view_count: r.view_count,
    reading_time: r.reading_time,
    published_at: r.published_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    category: r.c_id ? {
      id: r.c_id,
      slug: r.c_slug,
      name: r.c_name,
      description: r.c_description,
      color: r.c_color,
      icon: r.c_icon,
      sort_order: r.c_sort_order,
    } : null,
    tags: tagsMap.get(r.id) || [],
  };
}

/** 用 slug 取得單篇文章 */
export async function getArticleBySlug(db: D1Database, slug: string): Promise<ArticleWithMeta | null> {
  const result = await db.prepare(`
    SELECT a.*, c.id as c_id, c.slug as c_slug, c.name as c_name,
           c.description as c_description, c.color as c_color, c.icon as c_icon, c.sort_order as c_sort_order
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (!result) return null;

  const tagsMap = await getTagsForArticles(db, [result.id]);
  const r = result as any;

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    content_md: r.content_md,
    content_html: r.content_html,
    cover_image: r.cover_image,
    source_url: r.source_url,
    source_type: r.source_type,
    category_id: r.category_id,
    status: r.status,
    is_featured: r.is_featured,
    view_count: r.view_count,
    reading_time: r.reading_time,
    published_at: r.published_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    category: r.c_id ? {
      id: r.c_id,
      slug: r.c_slug,
      name: r.c_name,
      description: r.c_description,
      color: r.c_color,
      icon: r.c_icon,
      sort_order: r.c_sort_order,
    } : null,
    tags: tagsMap.get(r.id) || [],
  };
}

/** 批次取標籤 */
async function getTagsForArticles(db: D1Database, articleIds: number[]): Promise<Map<number, Tag[]>> {
  if (articleIds.length === 0) return new Map();

  const placeholders = articleIds.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT at.article_id, t.id, t.slug, t.name
    FROM article_tags at
    JOIN tags t ON at.tag_id = t.id
    WHERE at.article_id IN (${placeholders})
  `).bind(...articleIds).all();

  const map = new Map<number, Tag[]>();
  for (const row of result.results as any[]) {
    if (!map.has(row.article_id)) map.set(row.article_id, []);
    map.get(row.article_id)!.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
    });
  }
  return map;
}

/** 取得所有分類 */
export async function listCategories(db: D1Database): Promise<Category[]> {
  const result = await db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM articles a WHERE a.category_id = c.id AND a.status = 'published') as article_count
    FROM categories c
    ORDER BY c.sort_order ASC, c.id ASC
  `).all();
  return (result.results as any[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    color: r.color,
    icon: r.icon,
    sort_order: r.sort_order,
    article_count: r.article_count || 0,
  }));
}

/** 所有文章（後台用） */
export async function listAllArticles(db: D1Database): Promise<ArticleWithMeta[]> {
  const result = await db.prepare(`
    SELECT a.*, c.id as c_id, c.slug as c_slug, c.name as c_name,
           c.description as c_description, c.color as c_color, c.icon as c_icon, c.sort_order as c_sort_order
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    ORDER BY a.updated_at DESC
  `).all();

  const tagsMap = await getTagsForArticles(db, (result.results as any[]).map((r) => r.id));

  return (result.results as any[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    content_md: r.content_md,
    content_html: r.content_html,
    cover_image: r.cover_image,
    source_url: r.source_url,
    source_type: r.source_type,
    category_id: r.category_id,
    status: r.status,
    is_featured: r.is_featured,
    view_count: r.view_count,
    reading_time: r.reading_time,
    published_at: r.published_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    category: r.c_id ? {
      id: r.c_id,
      slug: r.c_slug,
      name: r.c_name,
      description: r.c_description,
      color: r.c_color,
      icon: r.c_icon,
      sort_order: r.c_sort_order,
    } : null,
    tags: tagsMap.get(r.id) || [],
  }));
}

/** 新增文章 */
export async function createArticle(
  db: D1Database,
  data: {
    slug: string;
    title: string;
    excerpt?: string;
    content_md: string;
    content_html?: string;
    cover_image?: string;
    source_url?: string;
    source_type?: string;
    category_id?: number;
    status?: 'draft' | 'published';
    is_featured?: number;
    reading_time?: number;
    tags?: string[];
  }
): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    INSERT INTO articles (slug, title, excerpt, content_md, content_html, cover_image, source_url, source_type, category_id, status, is_featured, reading_time, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.slug,
    data.title,
    data.excerpt || null,
    data.content_md,
    data.content_html || null,
    data.cover_image || null,
    data.source_url || null,
    data.source_type || null,
    data.category_id || null,
    data.status || 'draft',
    data.is_featured || 0,
    data.reading_time || estimateReadingTime(data.content_md),
    data.status === 'published' ? now : null,
    now,
    now
  ).run();

  const articleId = result.meta.last_row_id;

  if (data.tags && data.tags.length > 0) {
    await setArticleTags(db, articleId, data.tags);
  }

  return articleId;
}

/** 更新文章 */
export async function updateArticle(
  db: D1Database,
  id: number,
  data: {
    slug?: string;
    title?: string;
    excerpt?: string;
    content_md?: string;
    content_html?: string;
    cover_image?: string;
    source_url?: string;
    source_type?: string;
    category_id?: number;
    status?: 'draft' | 'published';
    is_featured?: number;
    reading_time?: number;
    tags?: string[];
  }
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  const fieldMap: Record<string, any> = {
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    content_md: data.content_md,
    content_html: data.content_html,
    cover_image: data.cover_image,
    source_url: data.source_url,
    source_type: data.source_type,
    category_id: data.category_id,
    status: data.status,
    is_featured: data.is_featured,
    reading_time: data.reading_time,
  };

  for (const [key, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }

  // 處理發布時間
  if (data.status === 'published') {
    const current = await db.prepare(`SELECT published_at FROM articles WHERE id = ?`).bind(id).first();
    if (!current?.published_at) {
      fields.push(`published_at = ?`);
      values.push(new Date().toISOString());
    }
  }

  if (fields.length > 0) {
    values.push(id);
    await db.prepare(`UPDATE articles SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  if (data.tags) {
    await setArticleTags(db, id, data.tags);
  }
}

/** 刪除文章 */
export async function deleteArticle(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM articles WHERE id = ?`).bind(id).run();
}

/** 設定文章的標籤（先刪後插） */
async function setArticleTags(db: D1Database, articleId: number, tagSlugs: string[]): Promise<void> {
  await db.prepare(`DELETE FROM article_tags WHERE article_id = ?`).bind(articleId).run();

  for (const slug of tagSlugs) {
    // 找 tag 或建立
    let tag = await db.prepare(`SELECT id FROM tags WHERE slug = ?`).bind(slug).first() as { id: number } | null;
    if (!tag) {
      const result = await db.prepare(`INSERT INTO tags (slug, name) VALUES (?, ?)`).bind(slug, slug).run();
      tag = { id: result.meta.last_row_id };
    }
    await db.prepare(`INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)`).bind(articleId, tag.id).run();
  }
}

/** 估算閱讀時間（中文 200 字/分鐘） */
export function estimateReadingTime(text: string): number {
  const cjkChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const minutes = Math.ceil(cjkChars / 400 + englishWords / 200);
  return Math.max(1, minutes);
}

/** 從 Astro context 取出 D1 binding */
export function getDB(context: any): D1Database {
  // Cloudflare Pages adapter: binding is at context.locals.runtime.env.DB
  const db = context?.locals?.runtime?.env?.DB
    || context?.env?.DB
    || (globalThis as any).DB;

  if (!db) {
    throw new Error('D1 binding DB not found. Ensure the route is server-rendered (export const prerender = false)');
  }
  return db;
}

/** 從 Astro context 取出 R2 binding */
export function getR2(context: any): R2Bucket {
  const r2 = context?.locals?.runtime?.env?.BUCKET
    || context?.cloudflare?.env?.BUCKET
    || context?.env?.BUCKET
    || (globalThis as any).BUCKET;

  if (!r2) {
    throw new Error('R2 binding BUCKET not found in context');
  }
  return r2;
}
