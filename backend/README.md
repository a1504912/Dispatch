# Dispatch Backend

FastAPI + SQLModel (SQLite) service that powers the Dispatch platform.

## Tech stack
- **FastAPI** — web framework
- **SQLModel** — ORM over SQLite
- **httpx** — async client for the Ollama bridge
- **pydantic-settings** — `.env` configuration

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit as needed
```

## Run (development)

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API docs (Swagger): http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

The SQLite database (`dispatch.db`) and tables are created automatically on
startup.

## Configuration (`.env`)

| Variable        | Description                                  | Default                                          |
| --------------- | -------------------------------------------- | ------------------------------------------------ |
| `OLLAMA_URL`    | Base URL of the Ollama server                | `http://localhost:11434`                         |
| `DATABASE_URL`  | SQLModel/SQLAlchemy database URL             | `sqlite:///./dispatch.db`                         |
| `CORS_ORIGINS`  | Comma-separated allowed frontend origins     | `http://localhost:5173,http://127.0.0.1:5173`    |
| `DEFAULT_MODEL` | Fallback Ollama model when an agent has none | `llama3`                                          |

## API endpoints

| Method   | Path                          | Description                          |
| -------- | ----------------------------- | ------------------------------------ |
| `GET`    | `/api/agents`                 | List agents                          |
| `POST`   | `/api/agents`                 | Create an agent                      |
| `DELETE` | `/api/agents/{id}`            | Delete an agent                      |
| `PATCH`  | `/api/agents/{id}/status`     | Switch status (active/idle/disabled) |
| `POST`   | `/api/chat`                   | Send a message to an agent           |
| `POST`   | `/api/schedule/generate`      | Turn a task list into events         |
| `GET`    | `/api/events`                 | List calendar events                 |
| `POST`   | `/api/events`                 | Create an event                      |
| `DELETE` | `/api/events/{id}`            | Delete an event                      |

## Project layout

```
backend/
├── app/
│   ├── main.py          # FastAPI app, CORS, router wiring
│   ├── config.py        # .env-backed settings
│   ├── database.py      # engine + session dependency
│   ├── models.py        # SQLModel tables (Agent, Event)
│   ├── schemas.py       # request/response models
│   ├── ollama_client.py # Ollama bridge
│   └── routers/         # agents, chat, schedule, events
├── requirements.txt
├── Dockerfile
└── .env.example
```

> Skeleton stage: every endpoint returns a basic response. `/api/chat` bridges
> to Ollama, and `/api/schedule/generate` lays tasks into sequential hour
> blocks — real AI planning comes later.
