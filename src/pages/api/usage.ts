import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import { getUsageSummary, upsertUsageDays, USAGE_PROVIDERS } from '../../lib/usage';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

const getEnv = (context: any) => context.locals.runtime?.env || context.locals.cloudflare?.env || context.locals.env || {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function ingestAuthorized(request: Request, expectedKeys: (string | undefined)[]) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('x-openclaw-key') || '';
  if (!token) return false;
  return expectedKeys.some((expected) => expected && token.length === expected.length && token === expected);
}

/** 公開讀取：首頁用量卡資料 */
export const GET: APIRoute = async (context) => {
  const db = getDB(context);
  const url = new URL(context.request.url);
  const providerParam = url.searchParams.get('provider');
  const providers = providerParam && (USAGE_PROVIDERS as readonly string[]).includes(providerParam)
    ? [providerParam as 'claude' | 'codex']
    : [...USAGE_PROVIDERS];

  const summaries = (await Promise.all(providers.map((p) => getUsageSummary(db, p)))).filter(Boolean);
  return json({ usage: summaries });
};

/** 私有寫入：本機 pipeline / 後台 upsert 日資料 */
export const POST: APIRoute = async (context) => {
  const env = getEnv(context);
  const viaKey = ingestAuthorized(context.request, [env.USAGE_INGEST_KEY, env.OPENCLAW_NEWS_INGEST_KEY, env.OPENCLAW_INGEST_KEY]);
  const viaAdmin = !viaKey && (await isAuthenticated(context.request, env.JWT_SECRET));
  if (!viaKey && !viaAdmin) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const provider = String(body.provider || '');
  if (!(USAGE_PROVIDERS as readonly string[]).includes(provider)) {
    return json({ error: `provider must be one of: ${USAGE_PROVIDERS.join(', ')}` }, 400);
  }
  const days = Array.isArray(body.days) ? body.days : null;
  if (!days || days.length === 0) return json({ error: 'days must be a non-empty array' }, 400);
  if (days.length > 400) return json({ error: 'too many days in one request (max 400)' }, 400);

  // 機器識別：每台機器只覆寫自己的列，首頁同日 SUM，重推不重複計
  const machine = String(body.machine || 'main').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'main';

  const db = getDB(context);
  const written = await upsertUsageDays(db, provider as 'claude' | 'codex', days, machine);
  return json({ success: true, provider, machine, written });
};
