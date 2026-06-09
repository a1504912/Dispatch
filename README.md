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

- **frontend** — Dashboard（行事曆 + AI 對話）與 Agents（員工管理）兩個頁面。
  詳見 [`frontend/README.md`](./frontend/README.md)。
- **backend** — Agents / Events / Chat / Schedule 的 API，串接 Ollama。
  詳見 [`backend/README.md`](./backend/README.md)。

## 快速開始（Docker Compose）

需要先在主機上跑好 [Ollama](https://ollama.com/)（預設 `http://localhost:11434`）。

```bash
docker compose up --build
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

## 資料結構

**Agent**：`id`, `name`, `role`, `model`（Ollama 模型名）, `system_prompt`,
`status`（active / idle / disabled）, `created_at`

**Event**：`id`, `title`, `start_time`, `end_time`, `description`,
`agent_id`（可為空）, `color`

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

## 開發狀態

目前是**骨架階段**：資料夾結構、路由、資料模型與每支 API 的基本回應都已就緒。
`/api/chat` 已串接 Ollama，`/api/schedule/generate` 先用簡單的時段排列，
AI 智慧排程等功能之後再補。
