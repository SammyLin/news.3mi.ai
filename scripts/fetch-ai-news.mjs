#!/usr/bin/env node
/**
* fetch-ai-news.mjs
*
* 自動抓 AI 圈最新內容 → AI 摘要成中文 → 寫進 Cloudflare D1
*
* Sources:
*   - RSS feeds (Hacker News, Simon Willison, Cloudflare, Anthropic, etc.)
*   - Twitter (AI 圈大 V)
*   - Brave web search (daily AI highlights)
*
* Usage:
*   node scripts/fetch-ai-news.mjs                  # run once
*   node scripts/fetch-ai-news.mjs --dry-run        # don't write to D1
*   node scripts/fetch-ai-news.mjs --max=10         # limit to 10 items
*
* Environment variables:
*   CLOUDFLARE_API_TOKEN    — Cloudflare API token (edit D1)
*   CLOUDFLARE_ACCOUNT_ID   — Cloudflare account ID
*   CLOUDFLARE_D1_DATABASE_ID — D1 database ID
*   BRAVE_API_KEY           — Brave search API key
*   OPENAI_API_KEY          — OpenAI API for summarization (optional)
*
* Cron via openclaw: see ~/.openclaw/cron/fetch-ai-news.json
*/

import { setTimeout as sleep } from 'node:timers/promises';

const D1_API = 'https://api.cloudflare.com/client/v4';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '782ea99a9b61fe5dcef072f99d341a85';
const DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || '29ccc16c-4e31-4e56-bbff-b8966623f1f9';
const D1_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BRAVE_KEY = process.env.BRAVE_API_KEY;
const D1_BASE = `${D1_API}/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}`;

const SOURCE_LABELS = {
  hackernews: 'Hacker News',
  simonwillison: 'Simon Willison',
  cloudflare: 'Cloudflare Blog',
  anthropic: 'Anthropic News',
  openai: 'OpenAI News',
  cursor: 'Cursor Blog',
  brave: 'Brave Search',
  twitter: 'Twitter/X',
};

// RSS sources
const RSS_SOURCES = [
  { url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+Claude+OR+GPT&count=20', source: 'hackernews', category: 1 },
  { url: 'https://simonwillison.net/atom/everything/', source: 'simonwillison', category: 1 },
  { url: 'https://blog.cloudflare.com/rss/', source: 'cloudflare', category: 2 },
  { url: 'https://www.anthropic.com/news/rss.xml', source: 'anthropic', category: 1 },
  { url: 'https://openai.com/blog/rss.xml', source: 'openai', category: 1 },
  { url: 'https://cursor.com/blog/rss.xml', source: 'cursor', category: 1 },
];

// Twitter accounts (will need an API key)
const TWITTER_ACCOUNTS = [
  { handle: 'sama', source: 'twitter', category: 1 },
  { handle: 'karpathy', source: 'twitter', category: 1 },
  { handle: 'daborai', source: 'twitter', category: 1 },
  { handle: 'swyx', source: 'twitter', category: 1 },
  { handle: '_sundarpichai', source: 'twitter', category: 1 },
  { handle: 'simonw', source: 'twitter', category: 1 },
];

// Brave search queries
const BRAVE_QUERIES = [
  { q: 'Claude Code new feature', freshness: 'day', source: 'brave', category: 1 },
  { q: 'AI agent framework 2026', freshness: 'week', source: 'brave', category: 1 },
  { q: 'Cloudflare D1 R2 announcement', freshness: 'week', source: 'brave', category: 2 },
  { q: 'OpenAI GPT-5 news', freshness: 'day', source: 'brave', category: 1 },
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MAX_ITEMS = (() => {
  const m = args.find(a => a.startsWith('--max='));
  return m ? parseInt(m.split('=')[1]) : 20;
})();

console.log(`[fetch-ai-news] Starting (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS})`);

// === Helpers ===

async function fetchRss(url, source, category) {
  console.log(`[RSS] ${source}: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'news-3mi-bot/1.0 (sammy@3mi.tw)' },
    });
    if (!res.ok) {
      console.warn(`[RSS] ${source} HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    return parseRss(text, source, category);
  } catch (e) {
    console.error(`[RSS] ${source} error: ${e.message}`);
    return [];
  }
}

function parseRss(xml, source, category) {
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRegex) || [];
  for (const item of matches) {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date');
    const description = extractTag(item, 'description') || extractTag(item, 'content:encoded');
    if (!title || !link) continue;
    items.push({
      source,
      source_type: 'rss',
      original_title: stripHtml(title).trim(),
      original_url: stripHtml(link).trim(),
      original_excerpt: stripHtml(description || '').slice(0, 500).trim(),
      category_id: category,
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

function stripHtml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function fetchBraveSearch(query, freshness, source, category) {
  if (!BRAVE_KEY) {
    console.warn('[Brave] no API key, skipping');
    return [];
  }
  console.log(`[Brave] ${query} (${freshness})`);
  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('freshness', freshness);
    url.searchParams.set('count', '5');
    const res = await fetch(url, { headers: { 'X-Subscription-Token': BRAVE_KEY } });
    if (!res.ok) {
      console.warn(`[Brave] HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.web?.results || []).map(r => ({
      source,
      source_type: 'brave',
      original_title: r.title,
      original_url: r.url,
      original_excerpt: r.description || '',
      category_id: category,
      published_at: new Date().toISOString(),
    }));
  } catch (e) {
    console.error(`[Brave] error: ${e.message}`);
    return [];
  }
}

async function summarizeItem(item) {
  // Simple rule-based summary: take first 2 sentences, max 300 chars
  // (Could be replaced with OpenAI call for better Chinese summaries)
  const text = item.original_excerpt || item.original_title;
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/&[a-z]+;/g, '')
    .trim();
  const sentences = cleaned.split(/(?<=[.!?。！？])\s+/);
  let summary = sentences.slice(0, 2).join(' ');
  if (summary.length > 300) summary = summary.slice(0, 297) + '...';

  // Simple translation placeholder: prefix with [EN→ZH] if text is English
  const isChinese = /[\u4e00-\u9fff]/.test(cleaned);
  if (!isChinese) {
    summary = `[EN] ${summary}\n\n[待中文摘要]`;
  }

  return {
    title_zh: isChinese ? item.original_title : `[EN] ${item.original_title.slice(0, 80)}`,
    excerpt_zh: summary,
    core_view: isChinese
      ? `${item.source} 這則更新值得追蹤，重點在產品能力、開發者工作流或 AI 基礎設施的變化。`
      : `這則 ${item.source} 更新值得追蹤，重點在產品能力、開發者工作流或 AI 基礎設施的變化。`,
  };
}

function buildContentMarkdown(item, summary) {
  const originalExcerpt = item.original_excerpt || summary.excerpt_zh;
  return [
    `> 本文由 OpenClaw 自動抓取來源後整理，保留原文連結，供快速判讀與後續人工補充。`,
    '',
    '## 事件摘要',
    '',
    summary.excerpt_zh,
    '',
    '## 事件分析',
    '',
    summary.core_view,
    '',
    '## 原始內容',
    '',
    originalExcerpt,
    '',
    `原文連結：${item.original_url}`,
  ].join('\n');
}

async function d1Execute(sql, params = []) {
  if (DRY_RUN) {
    console.log(`[D1:DRY] ${sql.slice(0, 80)}...`);
    return { success: true, dry: true };
  }
  if (!D1_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN required');
  }
  const res = await fetch(`${D1_BASE}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D1_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`D1 ${res.status}: ${t}`);
  }
  return res.json();
}

function slugify(s) {
  return s
    .toLowerCase()
    .slice(0, 60)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/--+/g, '-');
}

async function alreadyExists(originalUrl) {
  const r = await d1Execute(
    'SELECT id FROM articles WHERE slug = ? LIMIT 1',
    [`src-${slugify(originalUrl).slice(0, 80)}`]
  );
  return r.result?.[0]?.results?.length > 0;
}

async function insertItem(item, summary) {
  const slug = `src-${slugify(item.original_url).slice(0, 80)}`;
  const sql = `
    INSERT OR IGNORE INTO articles (
      slug, title, excerpt, content_md, content_html,
      category_id, status, is_featured, published_at, source_url, source_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    slug,
    summary.title_zh,
    summary.excerpt_zh.slice(0, 280),
    buildContentMarkdown(item, summary),
    null, // content_html will be generated client-side or in app
    item.category_id || 1,
    'published',
    0,
    item.published_at,
    item.original_url,
    SOURCE_LABELS[item.source] || item.source,
  ];
  return d1Execute(sql, params);
}

// === Main ===

async function main() {
  const allItems = [];

  // 1. Fetch RSS
  for (const src of RSS_SOURCES) {
    const items = await fetchRss(src.url, src.source, src.category);
    allItems.push(...items);
    await sleep(200);
  }

  // 2. Fetch Brave search
  for (const q of BRAVE_QUERIES) {
    const items = await fetchBraveSearch(q.q, q.freshness, q.source, q.category);
    allItems.push(...items);
    await sleep(500);
  }

  console.log(`[main] collected ${allItems.length} items`);

  // 3. Filter & dedupe
  const seen = new Set();
  const unique = allItems.filter(item => {
    if (seen.has(item.original_url)) return false;
    seen.add(item.original_url);
    return true;
  }).slice(0, MAX_ITEMS);

  console.log(`[main] unique items: ${unique.length}`);

  // 4. Insert to D1
  let inserted = 0;
  let skipped = 0;
  for (const item of unique) {
    try {
      if (await alreadyExists(item.original_url)) {
        skipped++;
        continue;
      }
      const summary = await summarizeItem(item);
      await insertItem(item, summary);
      inserted++;
      console.log(`[insert] ${item.source}: ${summary.title_zh.slice(0, 60)}`);
      await sleep(100);
    } catch (e) {
      console.error(`[insert] error: ${e.message}`);
    }
  }

  console.log(`[main] done. inserted=${inserted}, skipped=${skipped}`);
}

main().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});
