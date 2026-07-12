// 草稿審稿台:把 D1 裡所有 draft 拉出來,組成一頁可審閱的 HTML。
// 每篇可選「發佈 / 刪除 / 先留著」,底部生成可複製的處理指令(貼回給 Claude 執行)。
//
// 用法(repo 根目錄,需已 source CLOUDFLARE_API_TOKEN):
//   node scripts/draft-review.mjs [輸出路徑,預設 ./draft-review.html]

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { marked } from 'marked';

const OUT = process.argv[2] || './draft-review.html';

// 與 src/lib/markdown.ts 同款設定(審稿預覽用,無 raw HTML/code highlight 需求)
marked.setOptions({ gfm: true, breaks: false });
marked.use({
  renderer: {
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      const href = String(token.href || '');
      if (!/^(https?:\/\/|\/|#|mailto:)/i.test(href.trim())) return text;
      return `<a href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${text}</a>`;
    },
  },
});

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const raw = execSync(
  `npx wrangler d1 execute news-3mi-db --remote --json --command "SELECT id, slug, title, excerpt, content_md, reading_time, content_type, source_url FROM articles WHERE status='draft' ORDER BY id"`,
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
const drafts = JSON.parse(raw.slice(raw.indexOf('[')))[0].results;

const TYPE_LABEL = { signal: 'Signal', 'deep-dive': 'Deep Dive', 'field-note': 'Field Note', 'decision-card': 'Decision Card' };
const IC = {
  clock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  link: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  text: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>',
};

const cards = drafts
  .map((r) => {
    const cjk = (r.content_md.match(/[一-鿿]/g) || []).length;
    let domain = '—';
    try { domain = new URL(r.source_url).host; } catch {}
    return `
<article class="card" data-id="${r.id}">
  <div class="meta-row">
    <span class="chip chip-id">#${r.id}</span>
    <span class="chip">${TYPE_LABEL[r.content_type] || esc(r.content_type)}</span>
    <span class="chip">${IC.clock}${r.reading_time} 分鐘</span>
    <span class="chip">${IC.text}${cjk.toLocaleString()} 字</span>
    <span class="chip">${IC.link}${esc(domain)}</span>
  </div>
  <h2 class="card-title">${esc(r.title)}</h2>
  <p class="excerpt">${esc(r.excerpt)}</p>
  <div class="verdict" role="radiogroup" aria-label="文章 ${r.id} 處置">
    <label class="v v-pub"><input type="radio" name="v${r.id}" value="publish" onchange="tally()"><span>發佈</span></label>
    <label class="v v-keep"><input type="radio" name="v${r.id}" value="keep" checked onchange="tally()"><span>先留著</span></label>
    <label class="v v-del"><input type="radio" name="v${r.id}" value="delete" onchange="tally()"><span>刪除</span></label>
  </div>
  <details>
    <summary>展開全文</summary>
    <div class="prose">${marked.parse(r.content_md)}</div>
  </details>
</article>`;
  })
  .join('\n');

const page = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>reads.3mi.ai 草稿審稿台</title>
<style>
:root {
  --canvas:#faf8f5; --surface:#fff; --surface-subtle:#f5f3ef;
  --border:#f0ece5; --border-strong:#e7e5e4;
  --text:#292524; --text-2:#57534e; --text-3:#a8a29e;
  --brand:#ca8a04; --brand-hover:#a16207;
  --action:#292524; --on-action:#faf8f5; --danger:#b91c1c;
  --shadow-sm:0 1px 2px rgba(41,37,36,.04);
  --shadow-md:0 1px 2px rgba(41,37,36,.04),0 8px 24px rgba(41,37,36,.06);
  --ease:cubic-bezier(.32,.72,0,1);
  color-scheme: light;
}
* { box-sizing:border-box; }
html { background:var(--canvas); }
body { margin:0; background:var(--canvas); color:var(--text);
  font-family:'jf open 粉圓','jfOpenHuninn','PingFang TC','Noto Sans TC',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.62; }
.wrap { max-width:880px; margin:0 auto; padding:48px 20px 150px; }
.eyebrow { text-transform:uppercase; letter-spacing:.12em; font-size:.75rem; color:var(--brand); font-weight:700; margin:0 0 8px; }
h1 { font-size:clamp(1.7rem,4.5vw,2.35rem); line-height:1.1; letter-spacing:-.03em; margin:0 0 12px; text-wrap:balance; }
.lede { color:var(--text-2); margin:0 0 32px; max-width:62ch; text-wrap:pretty; }
.card { background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); margin-bottom:24px; padding:24px;
  transition:box-shadow .22s var(--ease), border-color .22s var(--ease), opacity .22s var(--ease); }
.card:hover { box-shadow:var(--shadow-md); }
.card.is-publish { border-color:var(--brand); box-shadow:0 0 0 1px var(--brand), var(--shadow-md); }
.card.is-delete { border-color:var(--danger); opacity:.55; }
.meta-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
.chip { display:inline-flex; align-items:center; gap:5px; font-size:.74rem; color:var(--text-2); background:var(--surface-subtle); border:1px solid var(--border); border-radius:999px; padding:3px 10px; white-space:nowrap; }
.chip-id { background:var(--action); color:var(--on-action); border-color:var(--action); font-variant-numeric:tabular-nums; }
.ic { width:13px; height:13px; flex:none; }
.card-title { font-size:1.22rem; line-height:1.32; letter-spacing:-.02em; margin:0 0 10px; text-wrap:balance; }
.excerpt { margin:0 0 16px; color:var(--text-2); font-size:.92rem; text-wrap:pretty; }
.verdict { display:inline-flex; background:var(--surface-subtle); border:1px solid var(--border); border-radius:999px; padding:3px; gap:2px; }
.v { position:relative; cursor:pointer; user-select:none; }
.v input { position:absolute; opacity:0; width:0; height:0; }
.v span { display:inline-block; padding:6px 16px; border-radius:999px; font-size:.84rem; color:var(--text-2); transition:all .14s var(--ease); }
.v:hover span { color:var(--text); }
.v input:focus-visible + span { outline:2px solid var(--brand); outline-offset:1px; }
.v-pub input:checked + span { background:var(--brand); color:#fff; font-weight:700; }
.v-keep input:checked + span { background:var(--surface); color:var(--text); font-weight:700; box-shadow:var(--shadow-sm); border:1px solid var(--border-strong); padding:5px 15px; }
.v-del input:checked + span { background:var(--danger); color:#fff; font-weight:700; }
details { margin-top:18px; border-top:1px solid var(--border); }
summary { cursor:pointer; padding:12px 0 0; font-size:.86rem; font-weight:700; color:var(--text-2); list-style:none; display:flex; align-items:center; gap:6px; }
summary::-webkit-details-marker { display:none; }
summary::before { content:''; width:8px; height:8px; border-right:2px solid currentColor; border-bottom:2px solid currentColor; transform:rotate(-45deg); transition:transform .14s var(--ease); margin-left:2px; }
details[open] summary::before { transform:rotate(45deg); }
summary:hover { color:var(--brand-hover); }
.prose { padding:8px 0 4px; line-height:1.85; font-size:.95rem; max-width:68ch; }
.prose h2 { font-size:1.08rem; letter-spacing:-.02em; margin:28px 0 10px; padding-top:14px; border-top:1px solid var(--border); }
.prose h3 { font-size:.98rem; margin:20px 0 8px; }
.prose p { margin:0 0 14px; text-wrap:pretty; }
.prose blockquote { margin:0 0 16px; padding:10px 16px; border-left:3px solid var(--brand); background:var(--surface-subtle); border-radius:0 10px 10px 0; color:var(--text-2); font-size:.9rem; }
.prose blockquote p { margin:0; }
.prose ul, .prose ol { padding-left:1.4em; margin:0 0 14px; }
.prose a { color:var(--brand-hover); }
.prose table { border-collapse:collapse; font-size:.86rem; min-width:100%; display:block; overflow-x:auto; }
.prose th, .prose td { border:1px solid var(--border-strong); padding:6px 10px; text-align:left; }
.prose th { background:var(--surface-subtle); }
.bar { position:fixed; left:0; right:0; bottom:0; background:rgba(255,255,255,.72); backdrop-filter:blur(22px) saturate(1.4); border-top:1px solid var(--border); padding:14px 20px; }
.bar-inner { max-width:880px; margin:0 auto; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.count { font-size:.88rem; color:var(--text-2); white-space:nowrap; }
.count b { font-variant-numeric:tabular-nums; }
.count .n-pub { color:var(--brand-hover); }
.count .n-del { color:var(--danger); }
.cmd { flex:1; min-width:200px; font-size:.82rem; color:var(--text-2); background:var(--surface-subtle); border:1px solid var(--border); border-radius:10px; padding:8px 12px; overflow-x:auto; white-space:nowrap; font-family:ui-monospace,Menlo,monospace; }
.btn { background:var(--action); color:var(--on-action); border:0; border-radius:10px; min-height:38px; padding:0 18px; font-size:.88rem; font-weight:700; cursor:pointer; font-family:inherit; transition:background .22s var(--ease), transform .1s var(--ease); }
.btn:hover { background:var(--brand); }
.btn:active { transform:scale(.97); }
.btn:focus-visible, summary:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }
@media (prefers-reduced-motion:reduce) { .card, .btn, .v span, summary::before { transition:none; } }
@media (prefers-reduced-transparency:reduce) { .bar { background:var(--surface); backdrop-filter:none; } }
</style>
</head>
<body>
<div class="wrap">
<header>
  <p class="eyebrow">reads.3mi.ai · Draft Review</p>
  <h1>${drafts.length} 篇草稿審稿台</h1>
  <p class="lede">每篇選一個處置:<strong>發佈</strong>(上線)、<strong>刪除</strong>(不想要的)、<strong>先留著</strong>(預設,維持草稿)。細讀就展開全文,選完把底部指令複製丟回給 Claude 執行。</p>
</header>
${cards}
<div class="bar">
  <div class="bar-inner">
    <span class="count">發佈 <b class="n-pub" id="np">0</b> · 刪除 <b class="n-del" id="nd">0</b> · 留著 <b id="nk">${drafts.length}</b></span>
    <code class="cmd" id="cmd">尚未選擇——選好後這裡會出現可直接複製的指令</code>
    <button class="btn" id="copy" onclick="copyCmd()">複製指令</button>
  </div>
</div>
</div>
<script>
function tally(){
  const pub=[], del_=[]; let keep=0;
  document.querySelectorAll('.card').forEach(c=>{
    const v=c.querySelector('input:checked').value;
    c.classList.toggle('is-publish', v==='publish');
    c.classList.toggle('is-delete', v==='delete');
    if(v==='publish') pub.push(c.dataset.id);
    else if(v==='delete') del_.push(c.dataset.id);
    else keep++;
  });
  np.textContent=pub.length; nd.textContent=del_.length; nk.textContent=keep;
  const parts=[];
  if(pub.length) parts.push('發佈:'+pub.join(', '));
  if(del_.length) parts.push('刪除:'+del_.join(', '));
  cmd.textContent = parts.length ? '請處理草稿——'+parts.join(';')+';其餘維持 draft。'
    : '尚未選擇——選好後這裡會出現可直接複製的指令';
}
function copyCmd(){
  const t=cmd.textContent;
  if(t.startsWith('尚未')) return;
  navigator.clipboard.writeText(t).then(()=>{
    copy.textContent='已複製'; setTimeout(()=>copy.textContent='複製指令',1400);
  });
}
</script>
</body>
</html>`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT} (${drafts.length} drafts)`);
