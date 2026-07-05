#!/usr/bin/env node
/**
 * 批次更新 D1 文章
 *
 * 用法：
 *   1. 準備 articles.json（含 slug, title, excerpt, content_md）
 *   2. node scripts/update-articles.mjs articles.json
 *
 * 流程：
 *   1. marked 把 content_md 轉 content_html
 *   2. 寫成 SQL file（避免 escape 問題）
 *   3. wrangler d1 execute --file= 執行
 */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

function escapeSQL(s) {
  if (typeof s !== 'string') return 'NULL';
  return "'" + s.replace(/'/g, "''") + "'";
}

function buildSQL(articles) {
  const lines = [];
  for (const a of articles) {
    const { slug, title, excerpt, content_md } = a;
    if (!slug || !title || !content_md) {
      console.error('跳過:', a);
      continue;
    }
    const content_html = marked.parse(content_md, { async: false });
    const reading_time = Math.max(1, Math.ceil(content_md.length / 400));
    lines.push(
      `UPDATE articles SET ` +
      `title = ${escapeSQL(title)}, ` +
      `excerpt = ${escapeSQL(excerpt || '')}, ` +
      `content_md = ${escapeSQL(content_md)}, ` +
      `content_html = ${escapeSQL(content_html)}, ` +
      `reading_time = ${reading_time}, ` +
      `updated_at = datetime('now') ` +
      `WHERE slug = ${escapeSQL(slug)};`
    );
  }
  return lines.join('\n\n');
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node update-articles.mjs <articles.json>');
    process.exit(1);
  }

  const articles = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`準備更新 ${articles.length} 篇文章...\n`);

  const sql = buildSQL(articles);
  const tmpDir = mkdtempSync(join(tmpdir(), 'news3mi-'));
  const sqlFile = join(tmpDir, 'update.sql');
  writeFileSync(sqlFile, sql);

  console.log(`SQL 寫到 ${sqlFile}（${sql.length} chars）\n`);

  try {
    const out = execSync(
      `npx wrangler d1 execute news-3mi-db --remote --file="${sqlFile}"`,
      { stdio: 'pipe', cwd: process.cwd() }
    );
    console.log(out.toString());
  } catch (err) {
    console.error('執行失敗:', err.message);
    if (err.stdout) console.error(err.stdout.toString());
    process.exit(1);
  } finally {
    try { unlinkSync(sqlFile); } catch {}
  }

  console.log('\n✅ 全部更新完成');
}

main();