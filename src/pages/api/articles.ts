import type { APIRoute } from 'astro';
import {
  listAllArticles,
  getArticleBySlug,
  createArticle,
  updateArticle,
  deleteArticle,
  getDB,
} from '../../lib/db';
import { isAuthenticated } from '../../lib/auth';
import { renderMarkdown, extractExcerpt } from '../../lib/markdown';

/** Render content_md to content_html if content_html is empty */
function ensureHtml<T extends { content_md: string; content_html: string | null }>(a: T): T {
  if (!a.content_html && a.content_md) {
    try {
      return { ...a, content_html: renderMarkdown(a.content_md) };
    } catch (e) {
      console.error('Failed to render markdown:', e);
      return a;
    }
  }
  return a;
}

export const prerender = false;

const getEnv = (context: any) => context.locals.runtime?.env || context.locals.cloudflare?.env || context.locals.env || {};

// Direct DB access — use context.locals.runtime.env (Cloudflare Pages adapter sets this up)
const getDBLocal = (context: any) => {
  const env = context?.locals?.runtime?.env;
  if (!env?.DB) {
    console.error('DB not found in context.locals.runtime.env. Keys:', env ? Object.keys(env).join(',') : 'undefined');
    throw new Error('D1 DB not found');
  }
  return env.DB;
};

export const GET: APIRoute = async (context) => {
  const db = getDBLocal(context);
  const url = new URL(context.request.url);

  const slug = url.searchParams.get('slug');
  if (slug) {
    const article = await getArticleBySlug(db, slug);
    if (!article) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    return new Response(JSON.stringify({ article: ensureHtml(article) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const articles = (await listAllArticles(db)).map(ensureHtml);
  return new Response(JSON.stringify({ articles }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!(await isAuthenticated(context.request, env.JWT_SECRET || 'fallback-secret'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = getDB(context);
  const body = await context.request.json() as any;

  const contentMd = body.content_md || '';
  const contentHtml = renderMarkdown(contentMd);
  const excerpt = body.excerpt || extractExcerpt(contentMd);

  const id = await createArticle(db, {
    slug: body.slug,
    title: body.title,
    excerpt,
    content_md: contentMd,
    content_html: contentHtml,
    cover_image: body.cover_image,
    source_url: body.source_url,
    source_type: body.source_type,
    category_id: body.category_id,
    status: body.status || 'draft',
    is_featured: body.is_featured ? 1 : 0,
    tags: body.tags || [],
  });

  return new Response(JSON.stringify({ id, success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!(await isAuthenticated(context.request, env.JWT_SECRET || 'fallback-secret'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = getDB(context);
  const url = new URL(context.request.url);
  const id = parseInt(url.searchParams.get('id') || '0');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  const body = await context.request.json() as any;
  const updates: any = { ...body };
  if (body.content_md !== undefined && !body.content_html) {
    updates.content_html = renderMarkdown(body.content_md);
    if (!body.excerpt) {
      updates.excerpt = extractExcerpt(body.content_md);
    }
  }
  if (body.is_featured !== undefined) {
    updates.is_featured = body.is_featured ? 1 : 0;
  }
  await updateArticle(db, id, updates);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!(await isAuthenticated(context.request, env.JWT_SECRET || 'fallback-secret'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = getDB(context);
  const url = new URL(context.request.url);
  const id = parseInt(url.searchParams.get('id') || '0');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }
  await deleteArticle(db, id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
