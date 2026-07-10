import type { APIRoute } from 'astro';
import { listCategories, getDB } from '../../lib/db';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

const getEnv = (context: any) => context.locals.runtime?.env || context.locals.cloudflare?.env || context.locals.env || {};

export const GET: APIRoute = async (context) => {
  try {
    const db = getDB(context);
    const categories = await listCategories(db);
    return new Response(JSON.stringify({ categories }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('categories GET error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!(await isAuthenticated(context.request, env.JWT_SECRET || 'fallback-secret'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = getDB(context);
  const body = await context.request.json() as any;

  const result = await db.prepare(`
    INSERT INTO categories (slug, name, description, color, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    body.slug,
    body.name,
    body.description || null,
    body.color || '#58a6ff',
    body.icon || '',
    body.sort_order || 0
  ).run();

  return new Response(JSON.stringify({ id: result.meta.last_row_id, success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};