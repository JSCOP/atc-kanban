# @atc/dashboard — React Frontend

## OVERVIEW

React 19 SPA: kanban board with real-time WebSocket updates. Vite + Tailwind CSS v4 + Zustand + React Router v7 + @dnd-kit.

## STRUCTURE

```
src/
├── main.tsx               # ReactDOM entry point
├── App.tsx                # BrowserRouter + route definitions (Layout wrapper)
├── index.css              # Tailwind base imports
├── types.ts               # Frontend-specific type definitions
├── api/
│   ├── client.ts          # HTTP fetch wrapper for /api/* endpoints
│   └── ws.ts              # WebSocket connection manager (singleton)
├── hooks/
│   ├── useWebSocket.ts        # WS lifecycle + dispatches events to Zustand stores
│   └── useRealtimeBoard.ts    # Board data polling + WS-triggered refresh
├── stores/
│   ├── board-store.ts     # Tasks, columns, drag-drop state
│   ├── agent-store.ts     # Agent list + status tracking
│   ├── event-store.ts     # Event log (real-time feed)
│   └── project-store.ts   # Current project selection
├── pages/
│   ├── BoardPage.tsx      # Kanban board with drag-drop columns
│   ├── AgentsPage.tsx     # Connected agents overview
│   ├── EventsPage.tsx     # Real-time event log
│   ├── TaskDetailPage.tsx # Task detail with comments + progress
│   └── SettingsPage.tsx   # Application settings
└── components/
    ├── layout/            # Shell, sidebar, header (3 files)
    ├── board/             # Board columns, task cards, drag-drop (3 files)
    ├── agents/            # Agent status cards (2 files)
    ├── events/            # Event log items (2 files)
    └── projects/          # Project selector (1 file)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a page | `src/pages/` + add route in `App.tsx` | Wrap in Layout route |
| Add a component | `src/components/{domain}/` | Group by feature domain |
| Add global state | `src/stores/` | Zustand store, one per domain |
| API calls | `src/api/client.ts` | Centralized fetch; all endpoints go through here |
| Real-time events | `src/hooks/useWebSocket.ts` | Dispatches WS messages to Zustand stores |
| Drag-drop logic | `src/stores/board-store.ts` | @dnd-kit integration state |

## CONVENTIONS

- **State**: Zustand stores (not Context/Redux) — one store per domain
- **Routing**: React Router v7; all pages wrapped in `<Layout />` outlet
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` — utility classes only
- **API proxy**: Dev mode proxies `/api` and `/ws` to `:4000` (vite.config.ts)
- **WebSocket**: Single connection initialized in `useWebSocket` hook at app root (`AppContent`)
- **Drag-drop**: @dnd-kit for kanban column/card reordering

## ANTI-PATTERNS

- **NEVER** call server URLs directly — always use `src/api/client.ts` wrapper
- **NEVER** import from `@atc/core` or `@atc/server` — dashboard is a standalone SPA
- Don't create additional WebSocket connections — single connection via `useWebSocket` hook
- Don't use CSS modules or styled-components — Tailwind utility classes only
- Don't add state outside Zustand — keep all shared state in `src/stores/`
