import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

const getEnv = (context: any) => context.locals.runtime?.env || context.locals.cloudflare?.env || context.locals.env || {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// 寬鬆但夠用的格式檢查；上限 254 為 RFC 5321 信箱長度
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 收訂閱。honeypot 欄位 `website` 有值視為 bot，回成功但不寫入。 */
export const POST: APIRoute = async (context) => {
  let body: any;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const honeypot = String(body.website || '');
  const source = String(body.source || '').slice(0, 200) || null;

  if (honeypot) return json({ success: true });
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ error: '請輸入有效的 Email' }, 400);
  }

  const db = getDB(context);
  const existing = await db.prepare(`SELECT id, status FROM subscribers WHERE email = ?`).bind(email).first() as { id: number; status: string } | null;

  if (existing) {
    // 退訂過的重新訂閱；已訂閱的冪等回成功（不洩漏名單狀態）
    if (existing.status === 'unsubscribed') {
      await db.prepare(`UPDATE subscribers SET status = 'subscribed', unsubscribed_at = NULL WHERE id = ?`).bind(existing.id).run();
    }
    return json({ success: true });
  }

  await db.prepare(`INSERT INTO subscribers (email, status, source, token) VALUES (?, 'subscribed', ?, ?)`)
    .bind(email, source, crypto.randomUUID()).run();
  return json({ success: true }, 201);
};

/** 名單匯出（admin 限定）。?format=csv 下載 CSV，預設回 JSON。 */
export const GET: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!(await isAuthenticated(context.request, env.JWT_SECRET))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = getDB(context);
  const result = await db.prepare(`SELECT email, status, source, created_at FROM subscribers ORDER BY created_at DESC`).all();
  const rows = (result.results || []) as any[];

  const url = new URL(context.request.url);
  if (url.searchParams.get('format') === 'csv') {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['email,status,source,created_at', ...rows.map((r) => [r.email, r.status, r.source, r.created_at].map(esc).join(','))].join('\n');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="subscribers.csv"',
        'cache-control': 'no-store',
      },
    });
  }
  return json({ total: rows.length, subscribers: rows });
};
