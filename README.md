# Dispatch

事情太多、腦袋不夠用？Dispatch 幫你把任務派給對的 AI 員工，自動排進行事曆，你只要看著辦就好。

Dispatch 是一個個人 AI 助理團隊管理平台：你建立一群 AI 員工（agents），
每個員工綁定一個 Ollama 模型與角色設定，然後透過對話與自動排程，
把任務分派出去並排進行事曆。

## Monorepo 結構

```
dispatch/
├── frontend/          # React + Vite 前端
├── backend/           # FastAPI + SQLModel 後端
├── docker-compose.yml
└── README.md
```

- **frontend** — Dashboard（行事曆 + AI 對話）、Agents（員工管理），
  以及自媒體工作室：內容、主題方向、數據分析三個頁面。
  詳見 [`frontend/README.md`](./frontend/README.md)。
- **backend** — Agents / Events / Chat / Schedule 的 API，串接 Ollama。
  詳見 [`backend/README.md`](./backend/README.md)。

## 快速開始（Docker Compose）

需要先在主機上跑好 [Ollama](https://ollama.com/)（預設 `http://localhost:11434`），
並拉好預設團隊用的兩個模型：

```bash
ollama pull qwen2.5-coder:7b   # 工程師（改程式）
ollama pull qwen3:8b           # 其他 agent 與預設模型
```

```bash
docker compose up --build

# （可選）建立預設的五個 AI 員工
docker compose exec backend python -m app.seed

# （可選）自媒體：建立 4 個範例主題方向；加 --demo 再塞 24 篇示範貼文與數據
docker compose exec backend python -m app.seed_content --demo
```

- 前端：http://localhost:5173
- 後端 API 文件：http://localhost:8000/docs

程式碼透過 volume 掛載，修改後會即時生效（前後端皆為 reload 模式）。

## 本機開發（不用 Docker）

兩個終端機分別啟動：

```bash
# 終端機 1 — backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# 終端機 2 — frontend
cd frontend
npm install
cp .env.example .env
npm run dev
```

## 自媒體工作室

給經營自媒體用的內容管理 + 數據分析，和 AI 員工共用同一個 backend 與 Ollama。

- **內容**（`/content`）— 貼文從「點子 → 草稿 → 已排程 → 已發佈」一路管理。
  可選平台（IG / FB / Threads / YouTube / TikTok / X / 部落格），
  內文有平台字數上限提示；可上傳多張圖片；選了主題方向會顯示受眾與語氣提醒。
  - **AI 小編**：寫初稿、想標題、Hashtag、潤飾內文、發想點子，
    會參考平台與主題方向的受眾 / 語氣（用 `DEFAULT_MODEL`）。
  - **成效數據**：從平台後台抄下觸及、讚、留言、分享、收藏、新增粉絲，
    可多次記錄（例如發文後 1 天、7 天），分析以最新一筆為準。
- **主題方向**（`/pillars`）— 定義帳號固定經營的題材（content pillar），
  寫下方向說明、目標受眾、語氣，並設定目標比例；卡片上直接看實際比例有沒有偏離。
- **數據分析**（`/analytics`）— 可切換近 7 / 30 / 90 天或全部：
  總觸及、互動率、新增粉絲、每週觸及趨勢、主題方向實際 vs 目標、
  各平台表現、星期幾發文效果最好、熱門貼文排行。
- **Dashboard 行事曆**也會顯示已排程 / 已發佈的貼文（主題方向顏色），點一下直接打開編輯。

> 互動 = 讚 + 留言 + 分享 + 收藏；互動率 = 互動 ÷ 觸及。
> 目前數據是手動輸入；之後可以再串各平台 API 自動抓。

## 資料結構

**Agent**：`id`, `name`, `role`, `model`（Ollama 模型名）, `system_prompt`,
`status`（active / idle / disabled）, `created_at`

**Event**：`id`, `title`, `start_time`, `end_time`, `description`,
`agent_id`（可為空）, `color`

**Pillar**（主題方向）：`id`, `name`, `description`, `audience`, `tone`, `color`,
`target_ratio`（0–100）, `created_at`

**Post**：`id`, `title`, `body`, `platform`, `status`（idea / draft / scheduled / published）,
`pillar_id`, `tags`, `scheduled_at`, `published_at`, `url`, `created_at`, `updated_at`

**PostImage**：`id`, `post_id`, `filename`, `original_name`, `position`

**PostMetric**：`id`, `post_id`, `recorded_at`, `views`, `likes`, `comments`,
`shares`, `saves`, `followers_gained`

## API 一覽

| Method   | Path                       | 說明                       |
| -------- | -------------------------- | -------------------------- |
| `GET`    | `/api/agents`              | 員工列表                   |
| `POST`   | `/api/agents`              | 新增員工                   |
| `DELETE` | `/api/agents/{id}`         | 刪除員工                   |
| `PATCH`  | `/api/agents/{id}/status`  | 切換狀態                   |
| `POST`   | `/api/chat`                | 傳訊息給指定 agent         |
| `POST`   | `/api/schedule/generate`   | 傳任務清單，自動規劃行程   |
| `GET`    | `/api/events`              | 行事曆事件列表             |
| `POST`   | `/api/events`              | 新增事件                   |
| `DELETE` | `/api/events/{id}`         | 刪除事件                   |
| `GET`    | `/api/pillars`             | 主題方向列表               |
| `POST`   | `/api/pillars`             | 新增主題方向               |
| `PATCH`  | `/api/pillars/{id}`        | 修改主題方向               |
| `DELETE` | `/api/pillars/{id}`        | 刪除（貼文變未分類）       |
| `GET`    | `/api/posts`               | 貼文列表（可篩 status / platform / pillar_id / q） |
| `POST`   | `/api/posts`               | 新增貼文                   |
| `GET`    | `/api/posts/{id}`          | 單篇貼文（含圖片、最新數據） |
| `PATCH`  | `/api/posts/{id}`          | 修改貼文                   |
| `DELETE` | `/api/posts/{id}`          | 刪除貼文（連同圖片、數據） |
| `POST`   | `/api/posts/{id}/images`   | 上傳圖片（multipart，可多張） |
| `DELETE` | `/api/posts/{id}/images/{image_id}` | 刪除圖片          |
| `GET`    | `/api/posts/{id}/metrics`  | 數據記錄列表               |
| `POST`   | `/api/posts/{id}/metrics`  | 新增一筆數據               |
| `DELETE` | `/api/posts/{id}/metrics/{metric_id}` | 刪除數據        |
| `GET`    | `/api/analytics/summary?days=30` | 數據分析總覽         |
| `POST`   | `/api/content/assist`      | AI 小編（draft / titles / hashtags / polish / ideas） |

## 開發狀態

目前是**骨架階段**：資料夾結構、路由、資料模型與每支 API 的基本回應都已就緒。
`/api/chat` 已串接 Ollama，`/api/schedule/generate` 先用簡單的時段排列，
AI 智慧排程等功能之後再補。
