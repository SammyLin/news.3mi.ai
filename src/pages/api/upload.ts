import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../lib/auth';

export const prerender = false;

const getEnv = (context: any) =>
  context.locals.runtime?.env || context.locals.cloudflare?.env || context.locals.env || {};

// 允許的圖片 MIME types
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

// 副檔名對應
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/**
 * POST /api/upload
 * multipart/form-data, field name: "file"
 * 回傳：{ url: "https://images.news.3mi.ai/2026/07/xxx.jpg" }
 */
export const POST: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!(await isAuthenticated(context.request, env.JWT_SECRET))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const bucket: R2Bucket | undefined = env.BUCKET;
  if (!bucket) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), { status: 500 });
  }

  // 解析 multipart
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Invalid multipart form', detail: e?.message }), {
      status: 400,
    });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'Missing file field' }), { status: 400 });
  }

  // 驗證大小（5 MB）
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: 'File too large (max 5MB)' }), { status: 413 });
  }

  // 驗證型別
  if (!ALLOWED_TYPES.has(file.type)) {
    return new Response(
      JSON.stringify({ error: `Unsupported type: ${file.type}`, allowed: [...ALLOWED_TYPES] }),
      { status: 415 }
    );
  }

  // 組 key：YYYY/MM/uuid.ext（避免撞名 + 易整理）
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uuid =
    typeof crypto !== 'undefined' && (crypto as any).randomUUID
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ext = EXT_MAP[file.type] || 'bin';
  const key = `${yyyy}/${mm}/${uuid}.${ext}`;

  // 上傳到 R2
  const body = await file.arrayBuffer();
  try {
    await bucket.put(key, body, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Upload failed', detail: e?.message }), {
      status: 500,
    });
  }

  // 組公開 URL（用 R2_PUBLIC_URL custom domain）
  const publicBase = (env.R2_PUBLIC_URL as string) || '';
  const url = publicBase ? `${publicBase.replace(/\/$/, '')}/${key}` : `/images/${key}`;

  return new Response(
    JSON.stringify({
      url,
      key,
      size: file.size,
      type: file.type,
      success: true,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

/** GET 列出最近上傳（debug 用，安全檢查後續再加） */
export const GET: APIRoute = async (context) => {
  const env = getEnv(context);
  if (!(await isAuthenticated(context.request, env.JWT_SECRET))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const bucket: R2Bucket | undefined = env.BUCKET;
  if (!bucket) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), { status: 500 });
  }

  const list = await bucket.list({ limit: 50 });
  const items = (list.objects || []).map((o: any) => ({
    key: o.key,
    size: o.size,
    uploaded: o.uploaded,
  }));

  return new Response(JSON.stringify({ items }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
