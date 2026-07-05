#!/usr/bin/env node
/**
* fetch-ai-news-wrangler.mjs
*
* 跟 fetch-ai-news.mjs 一樣，但用 wrangler CLI 寫 D1（不需要 API token）
*
* Usage: node scripts/fetch-ai-news-wrangler.mjs [--dry-run] [--max=10]
*/

import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ACCOUNT_ID = '782ea99a9b61fe5dcef072f99d341a85';
const DATABASE_ID = '29ccc16c-4e31-4e56-bbff-b8966623f1f9';
const PROJECT_DIR = '/Users/openbot/.openclaw/workspace/projects/news-3mi';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MAX_ITEMS = (() => {
  const m = args.find(a => a.startsWith('--max='));
  return m ? parseInt(m.split('=')[1]) : 20;
})();

console.log(`[fetch-ai-news] Starting (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS})`);

const RSS_SOURCES = [
  { url: 'https://simonwillison.net/atom/everything/', source: 'simonwillison', category: 1 },
  { url: 'https://blog.cloudflare.com/rss/', source: 'cloudflare', category: 2 },
  { url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+Claude&count=15', source: 'hackernews', category: 1 },
];

const SOURCE_LABELS = {
  hackernews: 'Hacker News',
  simonwillison: 'Simon Willison',
  cloudflare: 'Cloudflare Blog',
};

function stripHtml(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

async function fetchRss(url, source, category) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'news-3mi-bot/1.0 (sammy@3mi.tw)' },
    });
    if (!res.ok) {
      console.warn(`[RSS] ${source} HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    const items = [];
    const matches = text.match(/<item[\s\S]*?<\/item>/gi) || [];
    for (const item of matches) {
      const title = extractTag(item, 'title');
      const link = extractTag(item, 'link');
      const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date');
      const desc = extractTag(item, 'description') || extractTag(item, 'content:encoded');
      if (!title || !link) continue;
      items.push({
        source,
        original_title: stripHtml(title),
        original_url: stripHtml(link),
        original_excerpt: stripHtml(desc || '').slice(0, 500),
        category_id: category,
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
    return items;
  } catch (e) {
    console.error(`[RSS] ${source} error: ${e.message}`);
    return [];
  }
}

function slugify(s) {
  return s.toLowerCase().slice(0, 50)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/--+/g, '-');
}

function summarizeItem(item) {
  const text = item.original_excerpt || item.original_title;
  const cleaned = text.replace(/\s+/g, ' ').replace(/&[a-z]+;/g, '').trim();
  const sentences = cleaned.split(/(?<=[.!?。！？])\s+/);
  let summary = sentences.slice(0, 2).join(' ');
  if (summary.length > 280) summary = summary.slice(0, 277) + '...';
  const isChinese = /[\u4e00-\u9fff]/.test(cleaned);
  return {
    title_zh: isChinese ? item.original_title.slice(0, 80) : item.original_title.slice(0, 80),
    excerpt_zh: isChinese ? summary : summary,
    core_view: `${item.source} 這則更新值得追蹤，重點在產品能力、開發者工作流或 AI 基礎設施的變化。`,
  };
}

function buildContentMarkdown(item, summary) {
  const originalExcerpt = item.original_excerpt || item.original_title;
  return [
    '> 本文由 OpenClaw 自動抓取來源後整理，保留原文連結，供快速判讀與後續人工補充。',
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

function execWrangler(sql) {
  try {
    const out = execSync(
      `npx wrangler d1 execute news-3mi-db --remote --command="${sql.replace(/"/g, '\\"')}"`,
      { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 30000 }
    );
    return { ok: true, out };
  } catch (e) {
    return { ok: false, error: e.message, stdout: e.stdout?.toString() };
  }
}

async function main() {
  // 1. Fetch RSS
  const allItems = [];
  for (const src of RSS_SOURCES) {
    const items = await fetchRss(src.url, src.source, src.category);
    allItems.push(...items);
    console.log(`[RSS] ${src.source}: ${items.length} items`);
    await sleep(200);
  }

  // 2. Dedupe + slice
  const seen = new Set();
  const unique = allItems.filter(item => {
    if (seen.has(item.original_url)) return false;
    seen.add(item.original_url);
    return true;
  }).slice(0, MAX_ITEMS);

  console.log(`[main] unique: ${unique.length}`);

  // 3. Insert
  let inserted = 0, skipped = 0;
  for (const item of unique) {
    const summary = summarizeItem(item);
    const slug = `src-${slugify(item.original_url)}`;
    const titleEsc = summary.title_zh.replace(/'/g, "''");
    const excerptEsc = summary.excerpt_zh.replace(/'/g, "''");
    const urlEsc = item.original_url.replace(/'/g, "''");
    const excerptMdEsc = buildContentMarkdown(item, summary).replace(/'/g, "''");
    const pubAt = item.published_at.replace(/'/g, "''");

    const sourceLabel = (SOURCE_LABELS[item.source] || item.source).replace(/'/g, "''");
    const sql = `INSERT OR IGNORE INTO articles (slug, title, excerpt, content_md, content_html, category_id, status, is_featured, published_at, source_url, source_type) VALUES ('${slug}', '${titleEsc}', '${excerptEsc}', '${excerptMdEsc}', NULL, ${item.category_id}, 'published', 0, '${pubAt}', '${urlEsc}', '${sourceLabel}')`;

    if (DRY_RUN) {
      console.log(`[DRY] ${item.source}: ${summary.title_zh.slice(0, 60)}`);
      inserted++;
    } else {
      const r = execWrangler(sql);
      if (r.ok) {
        inserted++;
        console.log(`[insert] ${item.source}: ${summary.title_zh.slice(0, 60)}`);
      } else {
        skipped++;
        console.error(`[skip] ${r.error.slice(0, 100)}`);
      }
      await sleep(300);
    }
  }

  console.log(`[main] done. inserted=${inserted}, skipped=${skipped}`);
}

main().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});
