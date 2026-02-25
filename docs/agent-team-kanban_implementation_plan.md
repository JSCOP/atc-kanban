# Agent Task Coordinator (ATC)

> MCP 기반 분산 AI Agent 태스크 코디네이션 시스템

---

## 1. 프로젝트 비전

### 문제 정의

현재 AI 코딩 에이전트(Claude Code, Codex, Gemini CLI, OpenCode 등)를 병렬로 운용할 때, 각 에이전트가 어떤 작업을 수행하고 있는지 추적하고, 작업 충돌을 방지하며, 전체 워크플로우를 조율할 통합된 방법이 없다.

vibe-kanban 같은 기존 도구는 **대시보드가 에이전트의 lifecycle을 직접 관리하는 중앙 집중형** 구조다. 에이전트를 대시보드 내부에서 spawn하고 터미널을 제어하는 방식이므로, 개발자가 자유롭게 선택한 환경(터미널, IDE, 원격 서버 등)에서 에이전트를 실행하기 어렵다.

### 목표

**"어떤 에이전트든, 어디서 실행되든, MCP 연결만으로 공유 칸반 보드에 접속하여 자율적으로 작업을 선택하고 수행하는 시스템"**

핵심 원칙:

- **Agent-Agnostic**: MCP를 지원하는 모든 에이전트가 참여 가능
- **Environment-Agnostic**: tmux, 별도 터미널, SSH, 어디서든 실행
- **Coordination-First**: 물리적 락킹으로 작업 충돌을 원천 차단
- **Orchestrator Pattern**: Main Agent가 전체를 관장하고, Worker Agent들이 실행

---

## 2. 아키텍처 개요

### 2.1 단일 서버, 두 가지 인터페이스

ATC는 하나의 프로세스에서 두 가지 인터페이스를 동시에 제공한다:

- **MCP 인터페이스** (stdio/SSE): AI Agent가 연결하여 태스크를 조회/선택/수행
- **HTTP/WebSocket 인터페이스**: 웹 대시보드가 연결하여 모니터링 및 수동 관리

두 인터페이스는 동일한 Core 로직과 DB를 공유한다.

```
┌──────────────────────────────────────────────────────────────────┐
│                        ATC Server (단일 프로세스)                  │
│                                                                   │
│  ┌─────────────────┐     ┌──────────────────────────────────┐    │
│  │  MCP Transport  │     │  HTTP Server + WebSocket          │    │
│  │  (stdio / SSE)  │     │  (REST API + 실시간 push)         │    │
│  └────────┬────────┘     └──────────────┬───────────────────┘    │
│           │                              │                        │
│           └──────────┬───────────────────┘                        │
│                      ▼                                            │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                     Core Services                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐              │    │
│  │  │ Task     │  │ Lock     │  │ Event     │              │    │
│  │  │ Manager  │  │ Engine   │  │ Bus       │              │    │
│  │  └──────────┘  └──────────┘  └───────────┘              │    │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐              │    │
│  │  │ Agent    │  │ Role     │  │ Heartbeat │              │    │
│  │  │ Registry │  │ Manager  │  │ Monitor   │              │    │
│  │  └──────────┘  └──────────┘  └───────────┘              │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         ▼                                         │
│                 ┌───────────────┐                                  │
│                 │    SQLite     │                                  │
│                 └───────────────┘                                  │
└───────┬─────────────────────────────────────────┬────────────────┘
        │ MCP                                      │ HTTP/WS
        ▼                                          ▼
┌─────────────────────┐                    ┌─────────────────────┐
│   AI Agents         │                    │   Web Dashboard     │
│                     │                    │   (브라우저)          │
│  ┌───────────────┐  │                    │  ┌───────────────┐  │
│  │ Main Agent    │  │                    │  │ 칸반 보드      │  │
│  │ (Orchestrator)│  │                    │  │ Agent 모니터   │  │
│  └───────────────┘  │                    │  │ 이벤트 피드    │  │
│  ┌───────────────┐  │                    │  │ 수동 관리      │  │
│  │ Worker 1      │  │                    │  └───────────────┘  │
│  │ Worker 2      │  │                    │                     │
│  │ Worker N      │  │                    │                     │
│  └───────────────┘  │                    │                     │
│                     │                    │                     │
│  (아무 터미널에서    │                    │  (브라우저에서       │
│   아무 agent 실행)  │                    │   http://localhost) │
└─────────────────────┘                    └─────────────────────┘
```

### 2.2 실행 모델

```bash
# 서버 실행 (하나의 명령어로 MCP + HTTP + Dashboard 모두 기동)
pnpm start
# → MCP stdio server: 각 agent의 mcp config에 등록
# → HTTP API:         http://localhost:4000/api
# → WebSocket:        ws://localhost:4000/ws
# → Dashboard:        http://localhost:4000  (정적 파일 서빙)
```

개발 시에는 백엔드와 프론트엔드를 각각 실행할 수 있다:

```bash
pnpm dev:server     # 백엔드만 (API + MCP + WebSocket)
pnpm dev:dashboard  # 프론트엔드만 (Vite dev server, API 프록시)
pnpm dev            # 둘 다 동시 실행 (concurrently)
```

---

## 3. Agent 역할 시스템

### 3.1 역할 정의

시스템에는 두 가지 역할이 존재한다:

| 구분 | Main (Orchestrator) | Worker (Executor) |
|------|--------------------|--------------------|
| 수량 | **정확히 1개** | 0~N개 |
| 역할 | 전체 보드 관리, 태스크 생성/삭제, 리뷰, 이벤트 수신 | 태스크 선택(claim), 실행, 상태 보고 |
| 태스크 수행 | 직접 수행하지 않음 (관리만) | 직접 코드 작성/수행 |
| 이벤트 | 모든 이벤트 수신 (listen) | 자기 태스크 이벤트만 |
| MCP 도구 | 전체 관리 도구 세트 | 제한된 실행 도구 세트 |

### 3.2 Main Agent 등록 및 유일성 보장

Main Agent는 시스템에 **반드시 하나만** 존재해야 한다. 이를 보장하는 메커니즘:

```
[Agent 연결 시 흐름]

Agent → register_agent(role: "main")
          │
          ▼
    ┌─ DB에 active main이 있는가? ─┐
    │                               │
   Yes                             No
    │                               │
    ▼                               ▼
  main의 heartbeat가              Main 등록 성공
  만료되었는가?                     → main_token 발급
    │                               
   Yes → 기존 main 강제 해제,      
         새 main 등록              
   No  → 등록 거부 (에러 반환:     
         "Main already active")    
```

구현 핵심:

- **DB 레벨 유일성**: `agents` 테이블에서 `role = 'main' AND status = 'active'` 조건으로 `SELECT ... FOR UPDATE` → 이미 있으면 거부
- **Main Token**: Main 등록 시 UUID 토큰 발급. 모든 Main 전용 작업에 이 토큰 필요
- **Heartbeat 기반 Failover**: Main이 heartbeat을 일정 시간(예: 60초) 보내지 않으면 자동 해제 → 다른 Agent가 Main으로 등록 가능
- **명시적 해제**: Main Agent가 정상 종료 시 `release_main()` 호출

### 3.3 Main Agent가 하는 일

Main Agent는 일반적인 AI 에이전트(Claude Code 등)에 시스템 프롬프트를 통해 Orchestrator 역할을 부여한다. Main Agent에게 기대하는 행동:

1. **프로젝트 분석** → 태스크 분해 → 보드에 todo 등록
2. **우선순위 지정** 및 태스크 간 **의존성 설정**
3. Worker Agent 이벤트 **실시간 모니터링**
4. `review` 상태 태스크 확인 → 리뷰 코멘트 작성 또는 `done`/`rejected` 처리
5. 전체 진행 상황 파악 및 필요 시 태스크 재배치
6. 블로킹 이슈 발생 시 태스크 우선순위 변경

---

## 4. MCP 인터페이스 설계

### 4.1 공통 도구 (Main + Worker 모두 사용 가능)

```
register_agent
├── params: { name: string, role: "main" | "worker", agent_type?: string }
├── returns: { agent_id, agent_token, role, event_stream_url? }
└── 설명: 에이전트 등록. role=main이면 유일성 검사 수행.

heartbeat
├── params: { agent_token: string }
├── returns: { status: "ok", pending_events?: Event[] }
└── 설명: 생존 신호 + Main인 경우 쌓인 이벤트 배치 수신 (polling 방식)

list_tasks
├── params: { status?: string[], priority?: string, assignee?: string, label?: string[] }
├── returns: { tasks: Task[] }
└── 설명: 필터 조건으로 태스크 목록 조회

get_task
├── params: { task_id: string }
├── returns: { task: TaskDetail }
└── 설명: 특정 태스크 상세 조회 (이력, 코멘트 포함)
```

### 4.2 Worker 전용 도구

```
claim_task
├── params: { agent_token: string, task_id: string }
├── returns: { lock_token: string, task: TaskDetail }
├── 에러: "ALREADY_LOCKED", "TASK_NOT_CLAIMABLE", "DEPENDENCY_NOT_MET"
└── 설명: 태스크 선택 + 물리적 락 획득. DB 트랜잭션으로 원자성 보장.
          status가 todo이고, 의존성이 충족된 태스크만 claim 가능.
          성공 시 status → locked → in_progress 자동 전환.
          Main에게 TASK_CLAIMED 이벤트 발행.

update_status
├── params: { lock_token: string, task_id: string, status: "in_progress" | "review" | "done" | "failed" }
├── returns: { task: TaskDetail }
└── 설명: 작업 상태 변경. lock_token 검증 필수.
          Main에게 STATUS_CHANGED 이벤트 발행.

report_progress
├── params: { lock_token: string, task_id: string, message: string }
├── returns: { ok: true }
└── 설명: 진행 상황 텍스트 업데이트. heartbeat 겸용.
          Main에게 PROGRESS_REPORTED 이벤트 발행.

release_task
├── params: { lock_token: string, task_id: string, reason?: string }
├── returns: { ok: true }
└── 설명: 락 해제 및 태스크를 다시 todo로 되돌림 (작업 포기 시).
          Main에게 TASK_RELEASED 이벤트 발행.
```

### 4.3 Main 전용 도구

```
create_task
├── params: { main_token, title, description, priority?, labels?, depends_on?: string[] }
├── returns: { task: Task }
└── 설명: 새 태스크 생성

update_task
├── params: { main_token, task_id, title?, description?, priority?, labels? }
├── returns: { task: Task }
└── 설명: 태스크 메타데이터 수정

delete_task
├── params: { main_token, task_id }
├── returns: { ok: true }
├── 조건: locked/in_progress 상태의 태스크는 삭제 불가
└── 설명: 태스크 삭제

set_dependency
├── params: { main_token, task_id, depends_on: string[] }
├── returns: { ok: true }
└── 설명: 태스크 간 의존성 설정 (DAG 순환 검사 포함)

review_task
├── params: { main_token, task_id, verdict: "approve" | "reject", comment?: string }
├── returns: { task: Task }
└── 설명: review 상태 태스크를 승인(done) 또는 반려(todo로 복귀)

force_release
├── params: { main_token, task_id }
├── returns: { ok: true }
└── 설명: 강제 락 해제 (응답 없는 Worker 처리)

poll_events
├── params: { main_token, since?: timestamp, types?: string[] }
├── returns: { events: Event[] }
└── 설명: 이벤트 폴링. Main Agent가 주기적으로 호출하여
          Worker들의 활동을 모니터링.

get_board_summary
├── params: { main_token }
├── returns: { 
│     todo: number, locked: number, in_progress: number,
│     review: number, done: number, failed: number,
│     agents: AgentStatus[], recent_events: Event[]
│   }
└── 설명: 보드 전체 현황 요약
```

---

## 5. 이벤트 시스템

### 5.1 이벤트 타입

```
TASK_CREATED        Main이 태스크 생성 시
TASK_CLAIMED        Worker가 태스크를 claim 시
TASK_RELEASED       Worker가 태스크를 release 시
STATUS_CHANGED      상태 변경 시 (in_progress → review 등)
PROGRESS_REPORTED   Worker가 진행 상황 보고 시
TASK_REVIEWED       Main이 리뷰 완료 시
AGENT_CONNECTED     에이전트 연결 시
AGENT_DISCONNECTED  에이전트 heartbeat 만료 시
LOCK_EXPIRED        락 TTL 만료로 자동 해제 시
```

### 5.2 Main Agent의 이벤트 수신 방식

MCP는 기본적으로 request-response 패턴이므로, 실시간 push가 어렵다. 두 가지 전략을 병행한다:

**전략 A: Polling (기본, 모든 MCP transport에서 동작)**

```
Main Agent의 시스템 프롬프트에 지시:
"작업 지시를 완료한 후, 5초 간격으로 poll_events를 호출하여
 Worker들의 상태 변화를 모니터링하라.
 review 상태가 된 태스크가 있으면 즉시 리뷰를 수행하라."

poll_events 호출 → 서버가 마지막 호출 이후 쌓인 이벤트 반환
```

이 방식은 단순하지만, agent가 자체적으로 polling loop를 돌려야 하므로 시스템 프롬프트에서 명확히 지시해야 한다.

**전략 B: Heartbeat 응답에 이벤트 포함 (Piggyback)**

```
Main이 heartbeat 호출 시, 응답에 pending_events 포함:
{
  "status": "ok",
  "pending_events": [
    { "type": "STATUS_CHANGED", "task_id": "...", "new_status": "review", ... },
    { "type": "TASK_CLAIMED", "task_id": "...", "agent_name": "worker-1", ... }
  ]
}
```

이 방식은 별도 polling 없이 heartbeat에 이벤트를 합쳐서 전달한다. 단, heartbeat 간격에 따라 지연이 발생한다.

**전략 C: SSE Transport 사용 시 Server-Sent Notifications (향후)**

MCP SSE transport를 사용하는 경우, 서버 → 클라이언트 방향의 notification을 활용할 수 있다. 이 경우 진정한 실시간 이벤트가 가능하지만, 현재 모든 에이전트가 SSE MCP를 지원하는 것은 아니므로 Phase 2 이후에 추가한다.

### 5.3 이벤트 저장

```sql
CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    task_id     TEXT,
    agent_id    TEXT,
    payload     TEXT,  -- JSON
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_created ON events(created_at);
CREATE INDEX idx_events_type ON events(type);
```

이벤트는 DB에 영구 저장하여 이력 추적 가능. poll_events는 `since` 타임스탬프 이후의 이벤트만 반환.

---

## 6. 물리적 락킹 상세 설계

### 6.1 Claim 트랜잭션 (SQLite)

```sql
-- 원자적 claim 수행 (BEGIN IMMEDIATE로 write lock 확보)
BEGIN IMMEDIATE;

-- 1. 태스크 상태 확인
SELECT id, status FROM tasks WHERE id = ? AND status = 'todo';
-- 결과 없으면 → ROLLBACK, 에러 반환

-- 2. 의존성 확인
SELECT COUNT(*) FROM task_dependencies d
  JOIN tasks t ON d.depends_on = t.id
  WHERE d.task_id = ? AND t.status != 'done';
-- count > 0이면 → ROLLBACK, "DEPENDENCY_NOT_MET"

-- 3. 락 획득
INSERT INTO task_locks (task_id, agent_id, lock_token, locked_at, expires_at)
  VALUES (?, ?, ?, NOW(), NOW() + INTERVAL 30 MINUTE);

-- 4. 상태 변경
UPDATE tasks SET status = 'in_progress', assigned_agent_id = ? WHERE id = ?;

-- 5. 이벤트 기록
INSERT INTO events (type, task_id, agent_id, payload) 
  VALUES ('TASK_CLAIMED', ?, ?, ?);

COMMIT;
```

### 6.2 Lock 갱신 및 만료

```
Worker가 report_progress 또는 heartbeat 호출 시:
  → task_locks.expires_at = NOW() + 30분 으로 갱신

Background Job (30초마다 실행):
  → expires_at < NOW() 인 락 탐색
  → 해당 태스크 status → 'todo'로 복귀
  → LOCK_EXPIRED 이벤트 발행
  → Main Agent에게 알림
```

### 6.3 Lock Token 검증

모든 Worker 작업(update_status, report_progress, release_task)에서:

```
1. lock_token으로 task_locks 조회
2. 존재하지 않거나 agent_id가 다르면 → 거부
3. expires_at이 지났으면 → 거부 (이미 만료)
4. 검증 통과 시에만 작업 수행
```

---

## 7. 데이터 모델

### 7.1 테이블 설계

```sql
-- 프로젝트 (멀티 프로젝트 지원)
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 태스크
CREATE TABLE tasks (
    id                TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    title             TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL DEFAULT 'todo'
                      CHECK(status IN ('todo','locked','in_progress','review','done','failed')),
    priority          TEXT DEFAULT 'medium'
                      CHECK(priority IN ('critical','high','medium','low')),
    labels            TEXT,  -- JSON array
    assigned_agent_id TEXT REFERENCES agents(id),
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 태스크 의존성 (DAG)
CREATE TABLE task_dependencies (
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    depends_on  TEXT NOT NULL REFERENCES tasks(id),
    PRIMARY KEY (task_id, depends_on),
    CHECK(task_id != depends_on)
);

-- 에이전트
CREATE TABLE agents (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    role           TEXT NOT NULL CHECK(role IN ('main','worker')),
    agent_type     TEXT,  -- 'claude_code', 'codex', 'gemini', 'opencode', 'custom'
    agent_token    TEXT NOT NULL UNIQUE,
    status         TEXT NOT NULL DEFAULT 'active'
                   CHECK(status IN ('active','disconnected')),
    connected_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 유일한 active main 보장
CREATE UNIQUE INDEX idx_unique_active_main 
    ON agents(role) WHERE role = 'main' AND status = 'active';

-- 태스크 락
CREATE TABLE task_locks (
    task_id     TEXT PRIMARY KEY REFERENCES tasks(id),
    agent_id    TEXT NOT NULL REFERENCES agents(id),
    lock_token  TEXT NOT NULL UNIQUE,
    locked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME NOT NULL
);

-- 이벤트 로그
CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    task_id     TEXT,
    agent_id    TEXT,
    payload     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 태스크 코멘트 (리뷰 등)
CREATE TABLE task_comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    agent_id    TEXT NOT NULL REFERENCES agents(id),
    content     TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 진행 로그
CREATE TABLE progress_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    agent_id    TEXT NOT NULL REFERENCES agents(id),
    message     TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2 태스크 상태 전이도

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
  ┌──────┐  claim  ┌────────────┐  worker 시작   ┌───────────┐
  │ todo │────────→│  locked    │──────────────→│in_progress│
  └──────┘         └────────────┘               └───────────┘
     ▲                  │                         │    │
     │                  │ release/                 │    │
     │                  │ lock_expired             │    │
     │                  │                          │    │
     │◄─────────────────┘                          │    │
     │                                             │    │
     │         review_task(reject)                  │    │
     │◄──────────────────────────┐                 │    │
     │                           │                 ▼    ▼
     │                      ┌─────────┐      ┌──────────┐
     │                      │ review  │      │  failed  │
     │                      └─────────┘      └──────────┘
     │                           │
     │    review_task(approve)   │
     │                           ▼
     │                      ┌──────┐
     └──────────────────────│ done │
                            └──────┘
```

---

## 8. Main Agent 시스템 프롬프트 가이드

Main Agent는 일반 AI 에이전트에 아래와 같은 시스템 프롬프트를 제공하여 Orchestrator로 동작시킨다:

```markdown
# Role: Project Orchestrator

You are the Main Orchestrator for this project. You manage the task board
via the ATC (Agent Task Coordinator) MCP server.

## Your Responsibilities

1. **Initialize**: Call `register_agent` with role "main" on startup.
2. **Plan**: Analyze the project and break it into atomic, well-defined tasks.
   Create tasks via `create_task` with clear titles, descriptions, and priorities.
3. **Set Dependencies**: Use `set_dependency` to establish execution order.
4. **Monitor**: Poll events every 10-15 seconds via `poll_events`.
   Watch for STATUS_CHANGED events, especially transitions to "review".
5. **Review**: When a task moves to "review":
   - Examine the worker's output
   - Either approve (→ done) or reject with feedback (→ todo)
6. **Adapt**: If workers report failures or blockers, reprioritize or
   create alternative tasks.

## Rules

- NEVER claim or execute tasks yourself. You only manage.
- Always check `get_board_summary` before making decisions.
- Keep tasks atomic: each should be completable by one agent in one session.
- Provide enough context in task descriptions for any agent to understand.

## Event Monitoring Loop

After initial setup, enter a monitoring loop:
1. Call `poll_events` 
2. Process any review-pending tasks
3. Check for stuck/failed tasks
4. Repeat
```

Worker Agent에게는 별도의 간결한 프롬프트:

```markdown
# Role: Task Executor

You are a Worker Agent. Connect to the ATC MCP server to find and execute tasks.

## Workflow

1. Call `register_agent` with role "worker".
2. Call `list_tasks` with status "todo" to see available work.
3. Pick the highest priority task you can handle.
4. Call `claim_task` to lock it.
5. Execute the task (write code, run tests, etc).
6. Periodically call `report_progress` with status updates.
7. When done, call `update_status` with "review".
8. Go to step 2 for the next task.

## Rules

- If `claim_task` fails with ALREADY_LOCKED, pick another task.
- If you cannot complete a task, call `release_task` with a reason.
- Report progress at least every 5 minutes to prevent lock expiry.
```

---

## 9. 웹 대시보드

### 9.1 설계 원칙

대시보드는 **사람이 보는 모니터링 + 관리 화면**이다. Agent를 실행하거나 spawn하지 않는다. 백엔드의 HTTP API와 WebSocket을 통해 데이터를 소비하며, 동일한 서버 프로세스에서 정적 파일로 서빙된다.

### 9.2 페이지 구성

```
Dashboard
├── / (메인)                    → 칸반 보드 뷰
├── /agents                    → Agent 모니터링 패널
├── /events                    → 이벤트 타임라인
├── /tasks/:id                 → 태스크 상세 (이력, 코멘트, 진행 로그)
└── /settings                  → 프로젝트 설정, lock TTL 조정 등
```

### 9.3 메인 페이지: 칸반 보드 (/)

핵심 화면. 전체 태스크를 상태별 컬럼으로 표시한다.

```
┌─────────────────────────────────────────────────────────────────┐
│  ATC Dashboard          [Project: my-app]     🟢 Main Online    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TODO (5)      │ IN PROGRESS (2) │ REVIEW (1)   │ DONE (8)     │
│  ───────────   │ ──────────────  │ ───────────  │ ──────────   │
│  ┌───────────┐ │ ┌─────────────┐ │ ┌──────────┐ │ ┌─────────┐ │
│  │ 🔴 Auth   │ │ │ 🟡 DB 스키마 │ │ │ 🔵 API   │ │ │ ✅ Init │ │
│  │ API 구현  │ │ │ 🔒 worker-1 │ │ │ 테스트   │ │ │ 프로젝트 │ │
│  │           │ │ │ 진행: 65%   │ │ │ worker-2 │ │ │         │ │
│  │ ⚡ high   │ │ │ 2분 전 보고  │ │ │ 리뷰대기 │ │ │         │ │
│  └───────────┘ │ └─────────────┘ │ └──────────┘ │ └─────────┘ │
│  ┌───────────┐ │ ┌─────────────┐ │              │             │
│  │ 🟡 UI     │ │ │ 🟡 캐싱 로직 │ │              │             │
│  │ 컴포넌트  │ │ │ 🔒 worker-3 │ │              │             │
│  │           │ │ │ 진행: 30%   │ │              │             │
│  │ ⚡ medium │ │ │ 5분 전 보고  │ │              │             │
│  └───────────┘ │ └─────────────┘ │              │             │
│                │                  │              │             │
├─────────────────────────────────────────────────────────────────┤
│  📊 Todo: 5 │ In Progress: 2 │ Review: 1 │ Done: 8 │ Failed: 0│
└─────────────────────────────────────────────────────────────────┘
```

**태스크 카드에 표시되는 정보:**

- 제목, 우선순위 뱃지 (critical/high/medium/low)
- 할당된 agent 이름 + 락 아이콘 (locked 상태 시)
- 마지막 진행 보고 시간 (상대 시간: "2분 전")
- 의존성 표시 (다른 태스크에 블로킹 중이면 시각적 표시)
- 클릭 시 상세 페이지로 이동

**수동 조작 (마우스로 조작 가능):**

- **태스크 생성**: + 버튼으로 새 태스크 추가 (제목, 설명, 우선순위, 라벨)
- **드래그 앤 드롭**: 태스크를 컬럼 간 이동 (locked/in_progress 상태는 이동 불가)
- **강제 락 해제**: 태스크 카드의 🔒 아이콘 우클릭 → "Force Release"
- **우선순위 변경**: 카드 내 드롭다운
- **태스크 삭제**: todo 상태 카드만 삭제 가능

### 9.4 Agent 모니터링 페이지 (/agents)

연결된 모든 에이전트의 상태를 실시간으로 보여준다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Agents (3 online, 1 offline)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👑 main-orchestrator          🟢 Online                        │
│  ├─ Type: claude-code                                            │
│  ├─ Connected: 45분 전                                           │
│  ├─ Last heartbeat: 3초 전                                       │
│  └─ Tasks created: 15 │ Reviews completed: 8                    │
│                                                                  │
│  🔧 worker-1                   🟢 Online                        │
│  ├─ Type: codex                                                  │
│  ├─ Connected: 30분 전                                           │
│  ├─ Current task: "DB 스키마 마이그레이션" (65%)                  │
│  ├─ Last progress: 2분 전                                        │
│  └─ Tasks completed: 3 │ Failed: 0                              │
│                                                                  │
│  🔧 worker-2                   🟢 Online                        │
│  ├─ Type: gemini-cli                                             │
│  ├─ Connected: 20분 전                                           │
│  ├─ Current task: "API 테스트 작성" (review 대기)                 │
│  └─ Tasks completed: 4 │ Failed: 1                              │
│                                                                  │
│  🔧 worker-3                   🔴 Offline (15분 전 연결 끊김)    │
│  ├─ Type: claude-code                                            │
│  ├─ Last seen: 15분 전                                           │
│  └─ ⚠️ Lock expired: "캐싱 로직" → 자동 해제됨                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.5 이벤트 타임라인 페이지 (/events)

모든 시스템 이벤트를 시간순으로 표시한다. 필터링 가능.

```
┌─────────────────────────────────────────────────────────────────┐
│  Events  [Filter: All ▼]  [Type: All ▼]  [Agent: All ▼]        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  14:32:05  🔵 STATUS_CHANGED   worker-2 → "API 테스트" → review │
│  14:31:42  📝 PROGRESS_REPORTED worker-1 → "DB 스키마" (65%)     │
│  14:30:15  ⚠️ LOCK_EXPIRED     worker-3 → "캐싱 로직" 자동해제  │
│  14:28:03  🔴 AGENT_DISCONNECTED worker-3 heartbeat 만료         │
│  14:25:11  ✅ TASK_REVIEWED     main → "유저 모델" → approved     │
│  14:22:45  🟢 TASK_CLAIMED      worker-1 → "DB 스키마"          │
│  14:20:00  📋 TASK_CREATED      main → "캐싱 로직" (medium)      │
│  ...                                                             │
│                                                                  │
│  [Load more]                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 9.6 태스크 상세 페이지 (/tasks/:id)

개별 태스크의 전체 이력을 볼 수 있다.

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    "DB 스키마 마이그레이션"              ⚡ high         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Status: 🟡 In Progress       Assigned: worker-1                │
│  Created: 14:10               Lock expires: 14:55               │
│  Labels: backend, database                                       │
│  Depends on: ✅ "프로젝트 초기화" (done)                         │
│  Blocks: "API 엔드포인트 구현" (todo)                            │
│                                                                  │
│  ── Description ──────────────────────────────────────────────── │
│  users, posts, comments 테이블을 생성하고                         │
│  Drizzle ORM 스키마를 정의한다. 마이그레이션 파일도 생성할 것.    │
│                                                                  │
│  ── Progress Log ─────────────────────────────────────────────── │
│  14:25  worker-1: users 테이블 스키마 완료, posts 작업 중         │
│  14:30  worker-1: posts, comments 완료. 마이그레이션 생성 중      │
│  14:32  worker-1: 진행률 65%                                     │
│                                                                  │
│  ── Review Comments ──────────────────────────────────────────── │
│  (아직 리뷰 전)                                                   │
│                                                                  │
│  ── History ──────────────────────────────────────────────────── │
│  14:10  Created by main-orchestrator                             │
│  14:22  Claimed by worker-1                                      │
│  14:22  Status: todo → in_progress                               │
│                                                                  │
│  [Force Release]  [Edit]  [Delete]                               │
└─────────────────────────────────────────────────────────────────┘
```

### 9.7 실시간 업데이트 메커니즘

```
브라우저 ──── WebSocket ──── ATC Server

연결 시:
  1. 브라우저가 ws://localhost:4000/ws 에 연결
  2. 서버가 현재 보드 상태 전체를 초기 메시지로 전송
  3. 이후 이벤트 발생 시마다 해당 이벤트를 실시간 push

메시지 형식:
  { "type": "TASK_CLAIMED", "payload": { "task_id": "...", "agent": "worker-1", ... } }
  { "type": "BOARD_SNAPSHOT", "payload": { "tasks": [...], "agents": [...] } }

브라우저 → 서버 (수동 조작 시):
  { "action": "CREATE_TASK", "payload": { "title": "...", ... } }
  { "action": "FORCE_RELEASE", "payload": { "task_id": "..." } }
```

Core의 Event Bus가 이벤트를 발행하면, MCP 쪽(poll_events)과 WebSocket 쪽(push) 양쪽에 동시에 전달된다. 같은 이벤트를 두 채널이 공유한다.

### 9.8 대시보드 기술 스택

| 항목 | 선택 | 이유 |
|------|-----|------|
| 프레임워크 | React + Vite | 생태계 크기, 라이브러리 풍부 |
| 스타일링 | Tailwind CSS | 빠른 프로토타이핑, 유틸리티 기반 |
| 상태 관리 | Zustand 또는 Jotai | 가벼움, WebSocket 통합 용이 |
| 드래그앤드롭 | @dnd-kit | 칸반 컬럼 간 태스크 이동 |
| 실시간 | native WebSocket | 별도 라이브러리 불필요 |
| 라우팅 | React Router | SPA 라우팅 |
| 빌드 결과 | 정적 파일 (dist/) | 서버가 직접 서빙, 별도 웹서버 불필요 |

### 9.9 HTTP API 엔드포인트 (대시보드 → 서버)

대시보드와 서버 간 통신에 사용되는 REST API. MCP 도구와는 별도로, 대시보드 전용.

```
Tasks
  GET    /api/tasks                  태스크 목록 (쿼리 파라미터로 필터링)
  GET    /api/tasks/:id              태스크 상세
  POST   /api/tasks                  태스크 생성
  PUT    /api/tasks/:id              태스크 수정
  DELETE /api/tasks/:id              태스크 삭제
  POST   /api/tasks/:id/force-release  강제 락 해제

Board
  GET    /api/board/summary          보드 요약 (카운트, 활성 agent 수)

Agents
  GET    /api/agents                 연결된 에이전트 목록

Events
  GET    /api/events                 이벤트 목록 (?since=&type=&limit=)

WebSocket
  WS     /ws                         실시간 이벤트 스트림
```

---

## 10. 기술 스택

단일 언어(TypeScript)로 백엔드와 프론트엔드를 모두 작성한다. pnpm workspace로 monorepo를 구성하여 하나의 저장소에서 관리한다.

| 컴포넌트 | 선택 | 버전/비고 |
|---------|------|----------|
| 런타임 | Node.js | v20+ (LTS) |
| 패키지 매니저 | pnpm | workspace 기능 활용 |
| 백엔드 프레임워크 | Hono | 경량, Edge 호환, WebSocket 지원 |
| DB | SQLite | better-sqlite3 (동기식, 트랜잭션 성능 우수) |
| DB 마이그레이션 | Drizzle ORM | 타입 안전 쿼리, 마이그레이션 자동 생성 |
| MCP SDK | @modelcontextprotocol/sdk | 공식 TypeScript SDK |
| MCP Transport | stdio (기본), SSE (향후) | stdio가 가장 범용적 |
| 프론트엔드 | React 19 + Vite | 빠른 HMR, 정적 빌드 |
| 스타일링 | Tailwind CSS v4 | 유틸리티 기반 |
| 드래그앤드롭 | @dnd-kit/core | 칸반 보드 태스크 이동 |
| 상태 관리 | Zustand | 가볍고 WebSocket 통합 용이 |
| 실시간 통신 | WebSocket (ws 라이브러리) | 서버 → 대시보드 이벤트 push |
| 빌드/번들 | tsup (서버), Vite (프론트) | 서버는 CJS 번들, 프론트는 정적 파일 |
| 테스트 | Vitest | 서버/프론트 모두 통일 |
| Lint/Format | Biome | ESLint + Prettier 대체, 빠름 |

---

## 11. 개발 로드맵

### Phase 1: Core + Locking (1~2주)

- [ ] pnpm workspace monorepo 셋업 (core, server, dashboard 패키지)
- [ ] Biome + tsconfig 공유 설정
- [ ] Drizzle ORM + SQLite: 스키마 정의 및 마이그레이션
- [ ] Task CRUD API (Hono 라우트)
- [ ] Claim/Release/Lock 엔진 (원자적 트랜잭션, better-sqlite3)
- [ ] Lock expiry background job (setInterval 기반)
- [ ] Agent 등록/해제 + heartbeat
- [ ] Main 유일성 보장 로직 (partial unique index)
- [ ] Event Bus (Node EventEmitter) + 이벤트 DB 저장
- [ ] WebSocket 기본 연결 (Event Bus → WS 브릿지)

**완료 기준**: HTTP API로 태스크를 만들고, 두 개의 curl 요청이 동시에 claim하면 하나만 성공하는 것을 확인.

### Phase 2: MCP 서버 (1~2주)

- [ ] MCP stdio transport 서버 래핑
- [ ] Worker 도구 세트 구현 (claim, update, release, progress)
- [ ] Main 도구 세트 구현 (create, review, poll_events, board_summary)
- [ ] Role 기반 도구 필터링 (Worker는 Main 도구 사용 불가)
- [ ] 에이전트 시스템 프롬프트 템플릿 작성

**완료 기준**: Claude Code에 MCP 설정을 추가하고, "할 일 목록 확인해서 작업 하나 골라서 해줘" 프롬프트로 태스크를 claim하고 수행하는 것을 확인.

### Phase 3: 실전 테스트 (1주)

- [ ] Main Agent 1 + Worker Agent 2로 실제 코딩 프로젝트 수행
- [ ] 동시 claim 충돌 테스트
- [ ] Agent crash 시 lock expiry 복구 테스트
- [ ] 이벤트 polling 안정성 테스트
- [ ] 시스템 프롬프트 튜닝

**완료 기준**: 3개 에이전트가 10개 태스크를 충돌 없이 분배하여 완료.

### Phase 4: 웹 대시보드 (1~2주)

- [ ] React + Vite 프로젝트 셋업 (packages/dashboard)
- [ ] Zustand 스토어 + WebSocket 연결 훅
- [ ] 메인 칸반 보드 뷰 (컬럼별 카드 렌더링)
- [ ] @dnd-kit 드래그앤드롭 통합 (수동 태스크 이동)
- [ ] 태스크 생성/편집 모달
- [ ] Agent 모니터링 페이지 (상태, heartbeat, 현재 작업)
- [ ] 이벤트 타임라인 페이지 (필터링, 무한 스크롤)
- [ ] 태스크 상세 페이지 (이력, 진행 로그, 리뷰 코멘트)
- [ ] 강제 락 해제 / 태스크 삭제 등 Admin 조작
- [ ] 서버에서 dashboard 정적 파일 서빙 (프로덕션 빌드)
- [ ] 반응형 레이아웃 (모바일 최소 지원)

**완료 기준**: 브라우저에서 칸반 보드를 열고, Agent가 태스크를 claim하면 실시간으로 카드가 이동하는 것을 확인.

### Phase 5: 고급 기능 (이후)

- [ ] 태스크 의존성 DAG 시각화
- [ ] SSE MCP transport 지원 (실시간 push 이벤트)
- [ ] Git worktree 자동 연동
- [ ] Agent capability 매칭 (특정 태스크 → 특정 agent 유형)
- [ ] Webhook 알림 (Slack, Discord)
- [ ] 멀티 프로젝트 지원
- [ ] Docker 패키징 및 원클릭 배포

---

## 12. 프로젝트 구조

하나의 저장소, 하나의 폴더에서 백엔드와 프론트엔드를 모두 관리한다. pnpm workspace를 사용한 monorepo 구조.

```
agent-task-coordinator/
│
├── package.json                    # Workspace root (pnpm-workspace.yaml)
├── pnpm-workspace.yaml             # packages/* 선언
├── biome.json                      # Lint/Format 설정 (전체 공유)
├── tsconfig.base.json              # 공유 TypeScript 설정
├── .env.example                    # 환경변수 템플릿
├── README.md
│
├── packages/
│   │
│   ├── core/                       # 🧠 핵심 비즈니스 로직 (DB, 서비스)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts       # Drizzle ORM 마이그레이션 설정
│   │   └── src/
│   │       ├── index.ts            # 공개 API (다른 패키지에서 import)
│   │       ├── db/
│   │       │   ├── schema.ts       # Drizzle 스키마 (tasks, agents, events 등)
│   │       │   ├── connection.ts   # SQLite 연결 관리
│   │       │   └── migrations/     # 자동 생성 마이그레이션 파일
│   │       ├── services/
│   │       │   ├── task-service.ts        # 태스크 CRUD + 상태 전이
│   │       │   ├── lock-engine.ts         # claim/release/expiry 원자적 트랜잭션
│   │       │   ├── agent-registry.ts      # 에이전트 등록/해제/heartbeat
│   │       │   ├── role-manager.ts        # Main 유일성 보장 + 역할 검증
│   │       │   ├── event-bus.ts           # 이벤트 발행/구독 (내부 EventEmitter)
│   │       │   └── dependency-resolver.ts # DAG 순환 검사 + 의존성 충족 확인
│   │       └── types.ts            # 공유 타입 (Task, Agent, Event 등)
│   │
│   ├── server/                     # 🌐 HTTP API + WebSocket + MCP 서버
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts          # 서버 번들링 설정
│   │   └── src/
│   │       ├── index.ts            # 진입점: HTTP + WS + MCP 기동
│   │       ├── http/
│   │       │   ├── app.ts          # Hono 앱 (라우트 등록, 미들웨어)
│   │       │   ├── routes/
│   │       │   │   ├── tasks.ts    # GET/POST/PUT/DELETE /api/tasks
│   │       │   │   ├── agents.ts   # GET /api/agents
│   │       │   │   ├── events.ts   # GET /api/events
│   │       │   │   └── board.ts    # GET /api/board (요약)
│   │       │   └── middleware/
│   │       │       └── error-handler.ts
│   │       ├── ws/
│   │       │   ├── handler.ts      # WebSocket 연결 관리
│   │       │   └── broadcaster.ts  # Event Bus → WebSocket 브릿지
│   │       ├── mcp/
│   │       │   ├── server.ts       # MCP 서버 인스턴스 생성
│   │       │   ├── tools/
│   │       │   │   ├── common-tools.ts   # register_agent, heartbeat, list_tasks
│   │       │   │   ├── worker-tools.ts   # claim_task, update_status, release
│   │       │   │   └── main-tools.ts     # create_task, review, poll_events
│   │       │   └── middleware/
│   │       │       └── role-guard.ts     # 역할 기반 도구 접근 제어
│   │       └── static.ts           # dashboard 정적 파일 서빙
│   │
│   └── dashboard/                  # 🎨 웹 프론트엔드 (React + Vite)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts          # 프록시 설정 (dev), 빌드 outDir 설정
│       ├── index.html
│       ├── tailwind.config.ts
│       └── src/
│           ├── main.tsx            # React 진입점
│           ├── App.tsx             # 라우터 설정
│           ├── api/
│           │   ├── client.ts       # HTTP API 클라이언트 (fetch wrapper)
│           │   └── ws.ts           # WebSocket 연결 + 재연결 로직
│           ├── stores/
│           │   ├── board-store.ts  # Zustand: 태스크 상태 (WebSocket 동기화)
│           │   ├── agent-store.ts  # Zustand: 에이전트 상태
│           │   └── event-store.ts  # Zustand: 이벤트 로그
│           ├── pages/
│           │   ├── BoardPage.tsx   # 메인 칸반 보드
│           │   ├── AgentsPage.tsx  # Agent 모니터링
│           │   ├── EventsPage.tsx  # 이벤트 타임라인
│           │   ├── TaskDetailPage.tsx  # 태스크 상세
│           │   └── SettingsPage.tsx    # 설정
│           ├── components/
│           │   ├── board/
│           │   │   ├── KanbanColumn.tsx
│           │   │   ├── TaskCard.tsx
│           │   │   └── CreateTaskModal.tsx
│           │   ├── agents/
│           │   │   ├── AgentCard.tsx
│           │   │   └── AgentStatusBadge.tsx
│           │   ├── events/
│           │   │   ├── EventItem.tsx
│           │   │   └── EventFilter.tsx
│           │   └── layout/
│           │       ├── Header.tsx
│           │       ├── Sidebar.tsx
│           │       └── Layout.tsx
│           └── hooks/
│               ├── useWebSocket.ts     # WS 연결 + 자동 재연결
│               └── useRealtimeBoard.ts # WS 이벤트 → store 업데이트
│
├── prompts/                        # 📝 Agent 시스템 프롬프트 템플릿
│   ├── main-orchestrator.md
│   └── worker-executor.md
│
├── scripts/                        # 🔧 유틸리티 스크립트
│   ├── dev.ts                      # concurrently로 server + dashboard 동시 실행
│   └── build.ts                    # 전체 빌드 (core → server → dashboard)
│
└── data/                           # 📁 런타임 데이터 (gitignore)
    └── atc.sqlite                  # SQLite DB 파일
```

### 12.1 패키지 간 의존성

```
dashboard ──→ (HTTP API / WebSocket) ──→ server ──→ core
                                           ↑
                                     MCP clients
                                     (AI agents)
```

- `core`는 순수 로직 패키지. 외부 의존성 최소화 (better-sqlite3, drizzle-orm 정도)
- `server`는 `core`를 import하여 HTTP/WS/MCP 인터페이스를 제공
- `dashboard`는 `server`의 HTTP API만 사용. 빌드 시 정적 파일을 `server`가 서빙

### 12.2 주요 스크립트 (root package.json)

```jsonc
{
  "scripts": {
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:dashboard\"",
    "dev:server": "pnpm -F @atc/server dev",
    "dev:dashboard": "pnpm -F @atc/dashboard dev",
    "build": "pnpm -F @atc/core build && pnpm -F @atc/server build && pnpm -F @atc/dashboard build",
    "start": "node packages/server/dist/index.js",
    "db:migrate": "pnpm -F @atc/core db:migrate",
    "db:studio": "pnpm -F @atc/core db:studio",  // Drizzle Studio (DB 브라우저)
    "test": "vitest",
    "lint": "biome check .",
    "format": "biome format --write ."
  }
}
```

### 12.3 프로덕션 배포 모드

```bash
pnpm build          # 전체 빌드
pnpm start          # 단일 프로세스로 모든 것 기동

# 결과:
# - packages/server/dist/index.js      → 서버 번들
# - packages/dashboard/dist/           → 정적 파일 (server가 서빙)
# - data/atc.sqlite                    → DB 파일 (자동 생성)
```

하나의 `node packages/server/dist/index.js` 실행으로 MCP 서버 + HTTP API + WebSocket + Dashboard 정적 서빙이 모두 작동한다. Docker 컨테이너 하나로도 배포 가능.


