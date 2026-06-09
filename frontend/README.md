# Dispatch Frontend

React + Vite single-page app for the Dispatch platform.

## Tech stack
- **React 18** + **Vite**
- **React Router** — routing
- **Tailwind CSS** — styling
- **FullCalendar** — calendar view
- **axios** — API calls (all under `src/api/`)

## Setup

```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_BASE_URL if backend isn't on :8000
```

## Run (development)

```bash
npm run dev
```

App runs at http://localhost:5173 and talks to the backend at
`VITE_API_BASE_URL` (default `http://localhost:8000`).

## Pages
- **Dashboard** (`/dashboard`) — FullCalendar view plus an AI chat box on the right.
- **Agents** (`/agents`) — create / delete agents and switch their status
  (active / idle / disabled).

## Project layout

```
frontend/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── src/
    ├── main.jsx          # entry + Router
    ├── App.jsx           # routes
    ├── index.css         # Tailwind directives
    ├── api/              # axios client + per-resource API calls
    │   ├── client.js
    │   ├── agents.js
    │   ├── chat.js
    │   ├── events.js
    │   └── schedule.js
    ├── components/
    │   ├── Layout.jsx    # top nav + page shell
    │   └── ChatBox.jsx   # AI chat panel
    └── pages/
        ├── Dashboard.jsx
        └── Agents.jsx
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build
```
