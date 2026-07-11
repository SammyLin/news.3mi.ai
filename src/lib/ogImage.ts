// 封面圖工具：抓原文 og:image，或自動產生一張品牌封面（SVG）。

function xmlEscape(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 把標題斷成最多 3 行（CJK 友善，用字元數估算）。 */
function wrapTitle(title: string, perLine = 15, maxLines = 3): string[] {
  const clean = title.trim();
  const lines: string[] = [];
  let rest = clean;
  while (rest.length > 0 && lines.length < maxLines) {
    if (rest.length <= perLine) { lines.push(rest); break; }
    if (lines.length === maxLines - 1) { lines.push(rest.slice(0, perLine - 1) + '…'); break; }
    lines.push(rest.slice(0, perLine));
    rest = rest.slice(perLine);
  }
  return lines;
}

/** 產生一張 1200x675 品牌封面 SVG（cream 底 + 分類色 + 分類名 + 標題 + 站名）。 */
export function buildCoverSvg(opts: { title: string; color?: string; label?: string }): string {
  const color = opts.color || '#ca8a04';
  const label = opts.label || '';
  const lines = wrapTitle(opts.title || '', 15, 3);
  const startY = 300 - (lines.length - 1) * 42;
  const titleTspans = lines
    .map((ln, i) => `<tspan x="90" y="${startY + i * 88}">${xmlEscape(ln)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#faf8f5" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="#faf8f5"/>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect x="0" y="0" width="12" height="675" fill="${color}"/>
  ${label ? `<rect x="90" y="96" rx="8" width="${Math.min(360, 44 + label.length * 30)}" height="46" fill="${color}" fill-opacity="0.14"/>
  <text x="112" y="128" font-family="'Noto Sans TC',system-ui,sans-serif" font-size="26" font-weight="700" fill="${color}">${xmlEscape(label)}</text>` : ''}
  <text font-family="'Noto Sans TC',system-ui,sans-serif" font-size="72" font-weight="800" fill="#292524" letter-spacing="-1.5">${titleTspans}</text>
  <text x="90" y="600" font-family="'Noto Sans TC',ui-monospace,monospace" font-size="30" font-weight="700" fill="#57534e">news.3mi.ai</text>
  <circle cx="1080" cy="560" r="8" fill="${color}"/>
</svg>`;
}

/** 相對封面 URL（存進 cover_image，卡片/文章頁當 img 用）。 */
export function generatedCoverPath(opts: { title: string; color?: string; label?: string }): string {
  const p = new URLSearchParams();
  p.set('title', opts.title || '');
  if (opts.color) p.set('color', opts.color);
  if (opts.label) p.set('label', opts.label);
  return `/api/og?${p.toString()}`;
}

/** 從 source_url 抓 og:image（失敗回 null，帶 timeout，不擋 ingest）。 */
export async function fetchOgImage(sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: { 'user-agent': 'news-3mi-ingest/1.0', accept: 'text/html' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const m =
      html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (!m) return null;
    let url = m[1].trim();
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/')) {
      try { url = new URL(url, sourceUrl).href; } catch { return null; }
    }
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}
