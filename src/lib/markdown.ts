// Markdown 渲染
// Cloudflare Workers 環境不支援 jsdom/DOMPurify，改以 marked renderer 層做 sanitize：
// - 原始 HTML（block/inline）一律 escape 成純文字，不會進入 DOM 當 markup
// - link/image URL 僅允許 https?:// 、 / 、 # 、 mailto: 開頭，其餘（javascript:, data:, vbscript:…）降級為純文字
// - highlight.js 的輸出（在 markdown parse 之後自行產生的 span markup）不受影響

import { marked } from 'marked';
import hljs from 'highlight.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只允許安全的 URL scheme（阻擋 javascript:, data:, vbscript: 等） */
function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|\/|#|mailto:)/i.test(url.trim());
}

// 設定 marked
marked.setOptions({
  gfm: true,
  breaks: false,
});

// 客製 renderer：sanitize + code block highlight
marked.use({
  renderer: {
    // 來源 markdown 內的原始 HTML（block 與 inline）→ escape 成文字
    html(token: any) {
      const raw = typeof token === 'string' ? token : (token.text ?? token.raw ?? '');
      return escapeHtml(raw);
    },
    link(token: any) {
      const text = (this as any).parser.parseInline(token.tokens);
      const href = String(token.href || '');
      if (!isSafeUrl(href)) return text; // 不安全的 href → 只輸出文字
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${escapeHtml(href)}"${title}>${text}</a>`;
    },
    image(token: any) {
      const src = String(token.href || '');
      const alt = escapeHtml(String(token.text || ''));
      if (!isSafeUrl(src)) return alt; // 不安全的 src → 只輸出 alt 文字
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${alt}"${title} />`;
    },
    code(token: any) {
      const code = typeof token === 'string' ? token : token.text;
      const lang = typeof token === 'string' ? '' : (token.lang || '');
      // highlight.js 的 .value 本身已 escape HTML；fallback 必須自行 escape
      let highlighted = escapeHtml(code);
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          highlighted = escapeHtml(code);
        }
      } else {
        try {
          highlighted = hljs.highlightAuto(code).value;
        } catch (e) {
          highlighted = escapeHtml(code);
        }
      }
      const langClass = String(lang).replace(/[^a-zA-Z0-9_+-]/g, '');
      return `<pre><code class="hljs language-${langClass}">${highlighted}</code></pre>`;
    },
  },
});

/** 渲染 Markdown → HTML（renderer 層已 sanitize 原始 HTML 與不安全 URL） */
export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** 從 Markdown 抽取 excerpt（取第一個段落或前 160 字） */
export function extractExcerpt(md: string, maxLen = 160): string {
  const plain = md
    .replace(/^#+ .+$/gm, '') // 移除標題
    .replace(/```[\s\S]*?```/g, '') // 移除 code block
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // links
    .replace(/[*_~>#-]+/g, '') // markdown 符號
    .replace(/\n+/g, ' ')
    .trim();

  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

/** 從 Markdown 標題抽取 slug */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[\u4e00-\u9fff]+/g, (m) => encodeURIComponent(m)) // 中文保留
    .replace(/[^a-z0-9\u4e00-\u9fff\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
