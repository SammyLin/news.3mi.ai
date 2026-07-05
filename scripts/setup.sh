#!/bin/bash
# news-3mi.ai 開發 / 部署 / 維護 scripts
# 用法: bash scripts/setup.sh [command]

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

case "${1:-help}" in
  dev)
    echo "🚀 啟動 dev server..."
    npx astro dev
    ;;
  build)
    echo "🔨 Build..."
    npx astro build
    ;;
  deploy)
    echo "🚀 Deploy 到 Cloudflare Pages..."
    npx wrangler pages deploy ./dist --project-name=news-3mi
    ;;
  db:migrate)
    echo "📦 Migration 到 remote D1..."
    npx wrangler d1 execute news-3mi-db --remote --file=migrations/0001_init.sql
    ;;
  db:seed)
    echo "🌱 Seed 到 remote D1..."
    npx wrangler d1 execute news-3mi-db --remote --file=migrations/extra_seed.sql
    ;;
  db:reset)
    echo "⚠️  Reset D1 (會刪除所有資料)..."
    npx wrangler d1 execute news-3mi-db --remote --command="DELETE FROM article_tags; DELETE FROM articles; DELETE FROM tags; DELETE FROM categories;"
    ;;
  fetch-news)
    echo "📡 抓 AI 新聞..."
    node scripts/fetch-ai-news-wrangler.mjs --max="${2:-10}"
    ;;
  status)
    echo "📊 專案狀態..."
    echo ""
    echo "== Cloudflare Pages =="
    npx wrangler pages project list 2>&1 | grep news-3mi
    echo ""
    echo "== D1 articles count =="
    npx wrangler d1 execute news-3mi-db --remote --command="SELECT COUNT(*) as total FROM articles" 2>&1 | grep total
    echo ""
    echo "== DNS =="
    dig news.3mi.ai +short 2>&1
    echo ""
    echo "== HTTPS =="
    curl -s -o /dev/null -w "news.3mi.ai: %{http_code}\n" --max-time 10 https://news.3mi.ai
    ;;
  *)
    echo "news-3mi.ai 維護指令"
    echo ""
    echo "用法: bash scripts/setup.sh [command]"
    echo ""
    echo "Commands:"
    echo "  dev           啟動 dev server (Astro)"
    echo "  build         Build 靜態站"
    echo "  deploy        Deploy 到 Cloudflare Pages"
    echo "  db:migrate    Migration D1 schema 到 remote"
    echo "  db:seed       Seed 範例資料到 remote"
    echo "  db:reset      清空 D1 所有資料（危險）"
    echo "  fetch-news    抓 AI 新聞（預設 10 篇）"
    echo "  fetch-news 20 抓 20 篇"
    echo "  status        顯示專案狀態"
    ;;
esac
