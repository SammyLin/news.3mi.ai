// LLM 用量統計 — 查詢與彙總（首頁熱力圖卡 / /api/usage 共用）
import type { D1Database } from './db';

export interface UsageDay {
  day: string; // YYYY-MM-DD
  tokens: number;
  cost_usd: number;
  messages: number;
  models: Record<string, number>;
}

export interface UsageSummary {
  provider: 'claude' | 'codex';
  days: UsageDay[]; // 舊 → 新
  totals: { tokens: number; cost_usd: number; messages: number };
  active_days: number;
  streak: number; // 到最近一個有資料日為止的連續天數
  top_model: string | null;
  model_share: { model: string; tokens: number; share: number }[]; // 由大到小
}

export const USAGE_PROVIDERS = ['claude', 'codex'] as const;

export async function getUsageSummary(
  db: D1Database,
  provider: 'claude' | 'codex',
  limitDays = 90 // 統計視窗：近 3 個月
): Promise<UsageSummary | null> {
  const since = new Date(Date.now() - limitDays * 86400000).toISOString().slice(0, 10);
  const result = await db.prepare(`
    SELECT day, tokens, cost_usd, messages, models
    FROM usage_daily
    WHERE provider = ? AND day >= ?
    ORDER BY day ASC
  `).bind(provider, since).all();

  const rows = (result.results as any[]) || [];
  if (rows.length === 0) return null;

  // 同一天可能有多台機器的列 → SUM 合併
  const byDay = new Map<string, UsageDay>();
  for (const r of rows) {
    const day = r.day;
    const entry = byDay.get(day) || { day, tokens: 0, cost_usd: 0, messages: 0, models: {} };
    entry.tokens += Number(r.tokens) || 0;
    entry.cost_usd += Number(r.cost_usd) || 0;
    entry.messages += Number(r.messages) || 0;
    for (const [model, tokens] of Object.entries(safeParseModels(r.models))) {
      entry.models[model] = (entry.models[model] || 0) + (Number(tokens) || 0);
    }
    byDay.set(day, entry);
  }
  const days: UsageDay[] = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  const totals = days.reduce(
    (acc, d) => ({
      tokens: acc.tokens + d.tokens,
      cost_usd: acc.cost_usd + d.cost_usd,
      messages: acc.messages + d.messages,
    }),
    { tokens: 0, cost_usd: 0, messages: 0 }
  );

  const active = days.filter((d) => d.tokens > 0);

  // streak：從最後一個有用量的日期往回數連續日
  let streak = 0;
  if (active.length > 0) {
    let cursor = new Date(`${active[active.length - 1].day}T00:00:00Z`).getTime();
    const activeSet = new Set(active.map((d) => d.day));
    while (activeSet.has(new Date(cursor).toISOString().slice(0, 10))) {
      streak += 1;
      cursor -= 86400000;
    }
  }

  const modelTotals = new Map<string, number>();
  for (const d of days) {
    for (const [model, tokens] of Object.entries(d.models)) {
      modelTotals.set(model, (modelTotals.get(model) || 0) + (Number(tokens) || 0));
    }
  }
  const modelTokenSum = [...modelTotals.values()].reduce((a, b) => a + b, 0);
  const model_share = [...modelTotals.entries()]
    .map(([model, tokens]) => ({ model, tokens, share: modelTokenSum > 0 ? tokens / modelTokenSum : 0 }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    provider,
    days,
    totals,
    active_days: active.length,
    streak,
    top_model: model_share[0]?.model || null,
    model_share,
  };
}

/** 依 provider+day+machine upsert 一批日資料（每台機器只覆寫自己的列） */
export async function upsertUsageDays(
  db: D1Database,
  provider: 'claude' | 'codex',
  days: Partial<UsageDay>[],
  machine = 'main'
): Promise<number> {
  let written = 0;
  for (const d of days) {
    const day = String(d.day || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    await db.prepare(`
      INSERT INTO usage_daily (provider, day, machine, tokens, cost_usd, messages, models, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider, day, machine) DO UPDATE SET
        tokens = excluded.tokens,
        cost_usd = excluded.cost_usd,
        messages = excluded.messages,
        models = excluded.models,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      provider,
      day,
      machine,
      Math.max(0, Math.round(Number(d.tokens) || 0)),
      Math.max(0, Number(d.cost_usd) || 0),
      Math.max(0, Math.round(Number(d.messages) || 0)),
      JSON.stringify(d.models && typeof d.models === 'object' ? d.models : {})
    ).run();
    written += 1;
  }
  return written;
}

function safeParseModels(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 格式化：7513000000 → 7.51B、59673 → 59,673、7810.5 → $7.81k */
export function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export function formatCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
