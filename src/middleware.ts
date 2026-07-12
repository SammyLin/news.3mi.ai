import { defineMiddleware } from 'astro:middleware';

// 舊網域 news.3mi.ai → reads.3mi.ai 301。
// /api/* 不轉,避免 ingest POST 在轉換期被 301 打斷(zone-level redirect rule 同樣排除)。
// READS_REDIRECT 未設為 "1" 時整段停用——reads.3mi.ai DNS 生效前開啟會讓全站文章頁 301 到
// 無法解析的網域。DNS 好了之後把 wrangler.toml 的 READS_REDIRECT 改 "1" 再部署。
export const onRequest = defineMiddleware((context, next) => {
  const env = (context.locals as any)?.runtime?.env || {};
  if (env.READS_REDIRECT !== '1') return next();
  const url = context.url;
  if (url.hostname === 'news.3mi.ai' && !url.pathname.startsWith('/api/')) {
    return context.redirect(`https://reads.3mi.ai${url.pathname}${url.search}`, 301);
  }
  return next();
});
