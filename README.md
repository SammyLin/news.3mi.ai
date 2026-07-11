# news.3mi.ai

Sammy 的 AI 工程筆記站 — 內容風格參考 [80aj.com](https://www.80aj.com/)，配色採 3mi 家族的溫暖 cream / gold 主題、純淨版無廣告。

## 技術棧

- **Astro 4** — 靜態站生成（SSG）+ 部分 island
- **Cloudflare Pages** — CDN 部署
- **Cloudflare D1** — SQLite 資料庫
- **Cloudflare R2** — 圖片物件儲存
- **Pages Functions** — 後端 API（articles CRUD + auth + upload）
- **Markdown** — 文章內容（marked + highlight.js + DOMPurify）

## 開發

```bash
# 1. 裝套件
npm install

# 2. 建本地 D1（用 wrangler）
npx wrangler d1 create news-3mi-db    # 建立後把 id 填回 wrangler.toml
npm run db:migrate:local              # 建表
npm run db:seed:local                 # 範例資料

# 3. 起 dev server
npm run dev                           # http://localhost:4321

# 4. 本地測 API
npx wrangler pages dev ./dist --d1=DB --compatibility-date=2026-01-01
```

## 部署

```bash
# 1. 推到 remote D1
npx wrangler d1 execute news-3mi-db --remote --file=migrations/0001_init.sql

# 2. 設定 secrets
npx wrangler pages secret put ADMIN_PASSWORD --project-name=news-3mi
npx wrangler pages secret put JWT_SECRET --project-name=news-3mi
npx wrangler pages secret put OPENCLAW_INGEST_KEY --project-name=news-3mi

# 3. 建立 R2 bucket
npx wrangler r2 bucket create news-3mi-images
# 綁定 custom domain: images.news.3mi.ai

# 4. Build + Deploy
npm run build
npx wrangler pages deploy ./dist --project-name=news-3mi

# 5. 綁 custom domain
# Cloudflare Dashboard → Pages → news-3mi → Custom domains → news.3mi.ai
```

## 專案結構

```
news-3mi/
├── src/
│   ├── pages/                  # Astro 頁面（公開 + 後台）
│   ├── components/             # ArticleCard, Header, Footer, Sidebar
│   ├── layouts/                # BaseLayout, AdminLayout
│   ├── lib/                    # db, markdown, auth
│   └── styles/                 # global.css（cream/gold 設計系統）
├── functions/
│   ├── api/                    # articles, categories, auth, upload
│   ├── lib/                    # Functions 用（複製自 src/lib）
│   ├── _utils.ts               # JSON / error / CORS helper
│   └── _middleware.ts          # 後台頁面保護
├── migrations/                 # D1 schema + seed
├── public/                     # favicon
├── wrangler.toml               # Cloudflare config
├── astro.config.mjs
├── package.json
└── SPEC.md                     # 完整規格
```

## 配色（3mi cream / gold 主題）

跟隨共用設計系統 [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)。

- 背景 `#faf8f5`（cream）/ 卡面 `#ffffff`
- 文字 `#292524` / `#57534e`
- 品牌 `#ca8a04`（gold）/ hover `#a16207`
- 分類色盤：AI 紫 / 架構藍 / 工具綠 / 實戰橘 / 安全紅 / 生活粉

## API Endpoints

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/articles` | 列出所有文章（後台用） |
| GET | `/api/articles?slug=xxx` | 取單篇 |
| POST | `/api/articles` | 新增（需登入） |
| PUT | `/api/articles?id=xxx` | 更新（需登入） |
| DELETE | `/api/articles?id=xxx` | 刪除（需登入） |
| GET | `/api/categories` | 列出分類 |
| POST | `/api/categories` | 新增分類（需登入） |
| GET | `/api/auth` | 檢查登入狀態 |
| POST | `/api/auth` | 登入（password） |
| DELETE | `/api/auth` | 登出 |
| POST | `/api/upload` | 上傳圖片到 R2（需登入） |
| GET | `/api/ingest` | 公開機器 feed，供 ChunkUp/OpenClaw 讀文章 |
| POST | `/api/ingest` | OpenClaw Bearer key 冪等新增／更新文章 |

OpenClaw POST 以 `source_url` 優先去重，支援 `related_chunk_url`、`related_chunk_title` 建立 ChunkUp 雙向連結。先套用 `migrations/0003_add_content_links.sql`。

**封面圖**：ingest 三段解析，每篇一定有封面 —
1. 有帶 `cover_image` → 直接用；
2. 沒帶 → 後端自動抓 `source_url` 的 `og:image`；
3. 都沒有 → 自動產生品牌封面（`/api/og` 動態 SVG，分類色 + 標題 + 站名）。

回應含 `cover_source`（`provided` / `og-image` / `generated`）；走到 generated 會回 `warnings`。要真實縮圖仍建議 OpenClaw 直接帶 `cover_image` 或確保原文有 `og:image`。動態封面端點：`GET /api/og?title=&color=&label=`。

## 後台

- `/admin/login` — 密碼登入
- `/admin` — 文章列表
- `/admin/new` — 新增（Markdown 編輯器 + 圖片上傳）
- `/admin/edit/[id]` — 編輯

密碼透過 `ADMIN_PASSWORD` secret 設定。

## 內容路線圖：對齊 80aj.com 的內容模型

目標：把 news.3mi.ai 做成像 [80aj.com](https://www.80aj.com/) 那樣的**原創長文型 AI 工程教學站**，而不是純新聞聚合。

**80aj 的內容模型：**
- 原創長文教學（大模型 / Agent / 工具實戰），非只是外部來源摘要。
- **主題課程／合集**（例：「AI 產品經理課」13 課、「AI 模型橫評」271 篇）— 跨文章的系列分組。
- 分區導覽：AI News / Trending / Topics / Snippets / Architecture / Tutorials / Security / Life / Tools / Management / Monitoring。
- 文章卡：封面縮圖 + 摘要 + 閱讀數 + 作者署名；首頁時間軸 feed + 熱門（依閱讀數）+ 主題合集。

**現況已具備：** 分類、`cover_image`、`excerpt`、editorial model（`content_type`: signal / deep-dive / field-note / decision-card）、ingest pipeline、archive / tag / category 頁、後台編輯器。結構其實已很接近，缺的主要是內容策略、系列合集、閱讀數與導覽。

### 差距與做法

**1. 內容策略（最重要，非技術）**
- 主力改成「原創長文教學 + 課程系列」；ingest 的來源摘要退為靈感/素材，不直接當主內容。
- **不要抓取 80aj 的文章**（著作權）。做的是「同樣的內容模型」，寫自己的原創內容。

**2. 資料模型（新 migration）**
- 新增 `series`（合集／課程）表：`id, slug, title, description, cover_image, sort_order`。
- `articles` 加 `series_id` + `series_order`（合集內排序）→ 支援課程系列與「上一課／下一課」。
- `articles` 加 `view_count`（讀取時 +1）；可選 `like_count`。
- 可選作者欄位（`author_name`, `author_avatar`）— 目前單作者，先 hardcode 亦可。
- 若要「Snippets」短內容：沿用 `content_type`，加 `snippet`。

**3. 頁面／UI**
- `/series/[slug]`：合集著陸頁，列出排序文章（像 80aj 的主題合集）。
- 文章頁：作者署名 + 閱讀數 + 系列內上一／下一課導覽。
- 導覽加 Topics（合集列表）、Trending（依 `view_count` 排序）、Snippets feed。
- 文章卡已有封面 / 摘要 / `reading_time`，補上閱讀數顯示。

**4. 分類擴充（可選）**
- 現有 `ai / architecture / tools / tutorial / security / life`，可加 `management`、`monitoring` 對齊 80aj 分區。

### 建議階段
1. **Phase 1 — 內容**：先手寫 3–5 篇原創長文，驗證編輯流程與版面。
2. **Phase 2 — 合集**：加 `series` 資料模型 + `/series/[slug]` + 系列導覽。
3. **Phase 3 — 互動訊號**：`view_count`（+ Trending 排序），可選 like。
4. **Phase 4 — 導覽／分區**：Topics、Snippets、擴充分類。

## 維護者

Sammy (林毅民) · the3mi.ai
