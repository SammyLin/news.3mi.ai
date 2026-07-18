#!/usr/bin/env node
// 把本機 LLM 用量推到 reads.3mi.ai 首頁用量卡。
//
// 資料來源：ccusage（讀 Claude Code / Codex CLI 本機 session log）
// 目的地：POST https://reads.3mi.ai/api/usage（(provider, day) 冪等 upsert，重跑安全）
//
// 用法：
//   node scripts/push-usage.mjs               # 近 126 天（首頁熱力圖範圍）
//   node scripts/push-usage.mjs --days 365    # 指定回溯天數
//   node scripts/push-usage.mjs --dry-run     # 只印 payload 不上傳
//
// 需要環境變數 USAGE_INGEST_KEY（在 ~/.zshrc.local）。可掛 cron / launchd 每日跑。

import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

const SITE = process.env.USAGE_SITE_URL || 'https://reads.3mi.ai';
// 機器識別：多台電腦各推各的列，網站端同日加總。可用 USAGE_MACHINE 覆寫。
const MACHINE = (process.env.USAGE_MACHINE || hostname().split('.')[0])
  .toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
const KEY = process.env.USAGE_INGEST_KEY || process.env.OPENCLAW_NEWS_INGEST_KEY || process.env.OPENCLAW_INGEST_KEY;
const PROVIDERS = ['claude', 'codex'];
const CHUNK = 400; // API 單次上限

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysBack = Number(args[args.indexOf('--days') + 1]) || 126;

if (!KEY && !dryRun) {
  console.error('缺 USAGE_INGEST_KEY（source ~/.zshrc.local 或用 --dry-run）');
  process.exit(1);
}

const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
console.log(`ccusage daily --by-agent --since ${since} ...`);

const raw = execFileSync('npx', ['-y', 'ccusage@latest', 'daily', '--json', '--by-agent', '--since', since], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'ignore'],
});
const report = JSON.parse(raw);

// day → provider → {tokens, cost, models}
const byProvider = new Map(PROVIDERS.map((p) => [p, []]));
for (const row of report.daily || []) {
  const day = row.period;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) continue;
  for (const agent of row.agents || []) {
    if (!byProvider.has(agent.agent)) continue;
    const models = {};
    for (const m of agent.modelBreakdowns || []) {
      models[m.modelName] =
        (models[m.modelName] || 0) +
        (m.inputTokens || 0) + (m.outputTokens || 0) +
        (m.cacheCreationTokens || 0) + (m.cacheReadTokens || 0);
    }
    byProvider.get(agent.agent).push({
      day,
      tokens: agent.totalTokens || 0,
      cost_usd: agent.totalCost || 0,
      messages: 0, // ccusage 沒有訊息數；首頁會改顯示活躍日
      models,
    });
  }
}

// 網路瞬斷（ECONNRESET 等)重試,免得 cron 單次失敗漏一天
async function postWithRetry(url, init, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.error(`fetch 失敗(${err.cause?.code || err.message}),${attempt * 5} 秒後重試 ${attempt}/${attempts - 1}`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}

for (const provider of PROVIDERS) {
  const days = byProvider.get(provider);
  if (days.length === 0) {
    console.log(`${provider}: 無資料，略過`);
    continue;
  }
  if (dryRun) {
    const tokens = days.reduce((a, d) => a + d.tokens, 0);
    const cost = days.reduce((a, d) => a + d.cost_usd, 0);
    console.log(`${provider}: ${days.length} 天, ${tokens.toLocaleString()} tokens, $${cost.toFixed(2)}（dry-run 不上傳）`);
    console.log(JSON.stringify(days.slice(-2), null, 2));
    continue;
  }
  for (let i = 0; i < days.length; i += CHUNK) {
    const chunk = days.slice(i, i + CHUNK);
    const res = await postWithRetry(`${SITE}/api/usage`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ provider, machine: MACHINE, days: chunk }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`${provider}: HTTP ${res.status} ${JSON.stringify(body)}`);
      process.exit(1);
    }
    console.log(`${provider} (${MACHINE}): 寫入 ${body.written} 天`);
  }
}
console.log('完成');
