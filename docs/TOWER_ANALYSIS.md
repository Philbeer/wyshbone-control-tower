# Wyshbone Control Tower - Repository Analysis

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Monitoring Capabilities](#monitoring-capabilities)
5. [Evaluator System](#evaluator-system)
6. [Dashboard Features](#dashboard-features)
7. [API Endpoints](#api-endpoints)
8. [Data Storage](#data-storage)
9. [Integration Points](#integration-points)
10. [Configuration](#configuration)
11. [Deployment](#deployment)
12. [Appendix](#appendix)

---

## Executive Summary

Wyshbone Control Tower is the **evaluation, monitoring, and quality assurance hub** for the Wyshbone ecosystem. It serves three primary functions:

1. **Monitoring Service**: Polls status data from Wyshbone UI and Supervisor applications at regular intervals (every 10 seconds), tracking code metrics like Lines of Code (LOC), TODO/FIXME counts, and a "cleverness index" metric.

2. **Evaluator & Investigation Engine**: Automatically detects issues with agent behaviour through automated behaviour tests, analyzes conversation quality, and generates AI-powered diagnoses and patch suggestions using OpenAI models.

3. **Dashboard & Observability Platform**: Provides both server-rendered HTML dashboards and a modern React SPA for viewing runs, investigations, manual flags, and system health.

Tower does **not** directly control or orchestrate agents - it observes, evaluates, and suggests fixes. It acts as the quality gate and debugging hub, enabling developers to identify issues in the AI agent workflows running in UI and Supervisor.

---

## Architecture Overview

### Tower's Role in the Wyshbone Ecosystem

```
┌─────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  Wyshbone   │◄──────►│ Control Tower   │◄──────►│   Wyshbone      │
│     UI      │ events │   (This Repo)   │ polling│   Supervisor    │
└──────┬──────┘        └────────┬────────┘        └─────────────────┘
       │                        │
       │  /tower/runs/log       │
       │  POST events           │
       │                        ▼
       │              ┌─────────────────┐
       │              │   PostgreSQL    │
       │              │   (Neon DB)     │
       │              └─────────────────┘
       │                        │
       │                        ▼
       │              ┌─────────────────┐
       │              │   OpenAI API    │
       │              │   (Analysis)    │
       │              └─────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tower Dashboards                              │
│  • React SPA (/dashboard) - Evaluator Console                   │
│  • Server-rendered HTML (/status) - Status & Plan               │
│  • Investigations (/investigations) - Diagnostic Reports        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

1. **Event Ingestion**: UI sends conversation events via `POST /tower/runs/log`
2. **Polling**: Tower polls UI and Supervisor `/export/status.json` endpoints
3. **Auto-Detection**: Failed tests or low-quality conversations trigger investigations
4. **AI Analysis**: OpenAI models (GPT-4o-mini default) diagnose issues and suggest patches
5. **Manual Flagging**: Users can flag problematic conversations for review

---

## Technology Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 4.21.x | HTTP server |
| TypeScript | 5.6.x | Type safety |
| Drizzle ORM | 0.39.x | Database queries |
| Neon PostgreSQL | - | Serverless database |
| OpenAI SDK | 6.9.x | AI analysis |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.x | UI framework |
| Vite | 5.4.x | Build tool & dev server |
| TanStack Query | 5.60.x | Server state management |
| Tailwind CSS | 3.4.x | Styling |
| shadcn/ui | - | Component library |
| Wouter | 3.3.x | Client-side routing |
| Recharts | 2.15.x | Charts |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Neon | Serverless PostgreSQL |
| OpenAI API | LLM for diagnostics |
| Replit (optional) | Hosting |

---

## Monitoring Capabilities

### What Tower Monitors

| Metric | Source | How Tracked | Where Displayed |
|--------|--------|-------------|-----------------|
| Cleverness Index | UI/Supervisor | Polled from `/export/status.json` | /status dashboard |
| Lines of Code | UI/Supervisor | Polled from `/export/status.json` | /status dashboard |
| TODO Count | UI/Supervisor | Polled from `/export/status.json` | /status dashboard |
| FIXME Count | UI/Supervisor | Polled from `/export/status.json` | /status dashboard |
| Live User Runs | UI | Received via `/tower/runs/log` | /dashboard |
| Conversation Quality | UI | Auto-analyzed on ingestion | /dashboard |
| Behaviour Test Results | Tower | Run against UI chat endpoint | /dashboard |

### Polling System

The `lib/poller.js` module handles source monitoring:

```javascript
// Configuration from config/sources.json
const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_SNAPSHOTS = 50;      // History retention per source

// Sources polled:
// - Wyshbone UI: /export/status.json
// - Wyshbone Supervisor: /export/status.json
```

**Delta Tracking**: Tower computes changes between polls for:
- Cleverness index changes
- LOC additions/deletions
- TODO/FIXME count changes

Recent changes are displayed in a ticker on the /status dashboard.

### Task Acceptance Checking

Tower can auto-mark tasks as "done" based on:

1. **Convention-based flags**: `UI-001` → checks for `ui001_done: true` in status.json
2. **Custom acceptance keys**: Task-specific status fields
3. **File content checks**: Verify specific code exists in source files

---

## Evaluator System

### Core Evaluator Modules

Located in `src/evaluator/`:

| Module | Purpose |
|--------|---------|
| `behaviourTests.ts` | Defines and executes behaviour tests against UI |
| `behaviourTestStore.ts` | Persists test results to database |
| `autoDetect.ts` | Auto-detects issues and triggers investigations |
| `executeInvestigation.ts` | Main investigation workflow |
| `runDiagnosis.ts` | AI-powered diagnosis generation |
| `conversationQualityAnalysis.ts` | Analyzes flagged conversations |
| `autoConversationQualityInvestigations.ts` | Auto-analyzes all conversations |
| `patchEvaluator.ts` | Evaluates proposed code patches |
| `patchGate.ts` | Approval/rejection decision logic |

### Behaviour Tests

Tower runs automated behaviour tests against Wyshbone UI:

| Test ID | Name | Category | What It Tests |
|---------|------|----------|---------------|
| `greeting-basic` | Greeting / onboarding | greeting | Verifies welcome message and goal prompting |
| `personalisation-domain` | Personalisation via domain | personalisation | Domain-aware response adaptation |
| `lead-search-basic` | Basic lead search | lead-search | Search execution and result handling |
| `monitor-setup-basic` | Monitoring setup | monitoring | Recurring task setup confirmation |

Tests call `POST /api/tower/chat-test` on the UI and validate responses using regex patterns.

### Investigation Types

| Trigger | Source | Auto/Manual |
|---------|--------|-------------|
| `manual` | User-initiated | Manual |
| `manual-from-run` | From run details | Manual |
| `timeout` | Test exceeded 10s | Auto |
| `tool_error` | Test execution error | Auto |
| `behaviour_flag` | Test failed | Auto |
| `conversation_quality` | Manual flag from UI | Manual |
| `auto_conversation_quality` | AI detected issue | Auto |
| `patch_failure` | Patch evaluation failed | Auto |
| `manual_flag` | User flagged run | Manual |

### Auto-Detection Logic

`src/evaluator/autoDetect.ts` triggers investigations when:

1. **Error status**: Test threw an exception
2. **Fail status**: Test heuristics not met
3. **Timeout**: Duration > 10,000ms
4. **Empty/short response**: Quality issues in AI output
5. **Regression**: Previous pass → current fail
6. **Repeated errors**: 2+ errors in 5 minutes for same test

### AI Diagnosis Flow

```
Investigation Created
        │
        ▼
Fetch Snapshots (UI/Supervisor code)
        │
        ▼
Build Investigation Context
        │
        ▼
Call OpenAI (GPT-4o-mini)
        │
        ▼
Parse Diagnosis & Patch Suggestion
        │
        ▼
Store in Database
```

The AI prompt instructs the model to output:
- `## DIAGNOSIS` - Root cause explanation
- `## PATCH SUGGESTION` - Copy-paste code fixes

---

## Dashboard Features

### React Dashboard (`/dashboard`)

The main SPA dashboard at `/dashboard` provides:

**Components:**
| Component | File | Purpose |
|-----------|------|---------|
| `RecentRunsSimple` | Shows latest conversation runs |
| `AutoFlaggedCard` | Auto-detected issues |
| `ManualFlagsCard` | User-flagged runs |
| `BehaviourTestsCard` | Test status and execution |
| `PatchFailuresCard` | Failed patch attempts |
| `RecentRunsTable` | Full run history table |
| `LiveUserRunsCard` | Real-time user conversations |

**Routes:**
| Path | Component | Purpose |
|------|-----------|---------|
| `/dashboard` | StatusDashboard | Main evaluator console |
| `/dashboard/investigate/:id` | InvestigatePage | Investigation details |
| `/dashboard/conversation/:id` | ConversationTimeline | Conversation view |
| `/dev/issues` | DevIssuesPage | Developer issue tracking |

**Features:**
- Real-time data refresh (30s polling)
- Investigation trigger buttons
- Patch approval workflow
- Reset all flags capability
- Advanced tools (collapsed by default)

### Server-Rendered Dashboard (`/status`)

Legacy HTML dashboard with:
- Auto-refresh every 60 seconds
- Source status cards (OK/ERROR badges)
- Metrics: Cleverness, LOC, TODO, FIXME
- Delta indicators (+/-) since last poll
- Recent changes ticker
- Task lists by layer/group
- Critical path section
- Evaluator roadmap section

---

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Load balancer health check |
| `/status.json` | GET | Aggregated polling state |
| `/status` | GET | Server-rendered dashboard |
| `/tasks.json` | GET | All tasks grouped by app |

### Tower API (`/tower/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tower/runs` | GET | List recent runs |
| `/tower/runs/live` | GET | List live user runs |
| `/tower/runs/log` | POST | **Main event ingestion endpoint** |
| `/tower/runs/:id` | GET | Get specific run |
| `/tower/runs/:id/flag` | POST | Manually flag a run |
| `/tower/runs/:id/investigate` | POST | Create investigation for run |
| `/tower/conversations` | GET | List conversations |
| `/tower/conversations/:id/events` | GET | Get conversation events |
| `/tower/conversations/:id/flag` | POST | Flag a conversation |
| `/tower/behaviour-tests` | GET | List tests with latest results |
| `/tower/behaviour-tests/run` | POST | Execute behaviour tests |
| `/tower/behaviour-tests/:id/investigate` | POST | Investigate specific test |
| `/tower/evaluator/investigate` | POST | Create investigation |
| `/tower/evaluator/investigations` | GET | List all investigations |
| `/tower/evaluator/investigations/:id` | GET | Get investigation details |
| `/tower/investigations/:id/evaluate` | POST | Run AI evaluation |
| `/tower/investigations/:id/generate-prompt` | POST | Generate Replit patch prompt |
| `/tower/patch/submit` | POST | Submit patch for evaluation |
| `/tower/patch/:id` | GET | Get patch evaluation result |
| `/tower/patch/approve/:id` | POST | Approve patch |
| `/tower/manual-flags` | GET | List manual flags |
| `/tower/reset-investigations` | POST | Clear all flags/investigations |

### Event Ingestion Payload

`POST /tower/runs/log` accepts:

```typescript
interface LiveUserRunPayload {
  runId?: string;           // Conversation ID (for grouping events)
  source: string;           // "live_user", "UI", "SUP", etc.
  userId?: string;          // User identifier
  userEmail?: string;       // User email
  sessionId?: string;       // Session ID
  request?: {
    inputText?: string;     // User message
    toolCalls?: Array<{ name: string; args?: any }>;
  };
  response?: {
    outputText?: string;    // Assistant response
    toolResultsSummary?: string;
  };
  status: "success" | "error" | "timeout" | "fail";
  goal?: string;
  startedAt?: number;       // Unix timestamp
  completedAt?: number;
  durationMs: number;
  model?: string;
  mode?: string;
  meta?: Record<string, any>;  // Messages array for conversation analysis
}
```

---

## Data Storage

### Database Schema

Located in `shared/schema.ts`, using Drizzle ORM with PostgreSQL:

**Tables:**

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Basic user auth | id, username, password |
| `runs` | Event/run tracking | id, conversation_run_id, source, user_identifier, goal_summary, status, meta |
| `investigations` | Diagnostic investigations | id, trigger, run_id, notes, run_logs, run_meta, diagnosis, patch_suggestion |
| `behaviour_tests` | Test definitions | id, name, description, category, isActive |
| `behaviour_test_runs` | Test execution history | id, testId, status, details, rawLog, durationMs |
| `patch_evaluations` | Patch evaluation results | id, status, patchText, diff, reasons, testResults |
| `patch_suggestions` | Suggested patches | id, investigationId, patchText, summary, status |
| `dev_issues` | Developer issue tracking | id, title, description, screenshotUrl, status |
| `dev_issue_context` | Issue context files | id, issueId, filePath, fileContents |
| `dev_issue_patches` | Issue patch suggestions | id, issueId, filePath, newContents |

### Data Retention

- **Polling snapshots**: 50 per source (in-memory)
- **Runs**: Persisted indefinitely (database)
- **Investigations**: Persisted indefinitely (database)
- **Behaviour test runs**: Persisted indefinitely (database)

---

## Integration Points

### Receiving Data From

| Source | Method | Endpoint | Data |
|--------|--------|----------|------|
| Wyshbone UI | POST | `/tower/runs/log` | Conversation events, user inputs/outputs |
| Wyshbone UI | POLL | `/export/status.json` | Code metrics, status flags |
| Wyshbone Supervisor | POLL | `/export/status.json` | Code metrics, status flags |

### Sending Data To

| Destination | Method | Purpose |
|-------------|--------|---------|
| OpenAI API | POST | AI-powered diagnosis and analysis |
| (None direct) | - | Tower is read-only observation layer |

### Authentication

- **Export polling**: `X-EXPORT-KEY` header with source-specific keys
- **Tower API**: `X-TOWER-API-KEY` header (optional)
- **CORS**: Configured for localhost, Vercel, and Render deployments

---

## Configuration

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API authentication |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | development/production |
| `FRONTEND_URL` | No | CORS allowed origin |
| `UI_URL` | No | CORS allowed origin |
| `SUPERVISOR_URL` | No | CORS allowed origin |
| `EVAL_MODEL_ID` | No | OpenAI model (default: gpt-4o-mini) |
| `HOSTING_USAGE_USD` | No | Display hosting cost meter |
| `HOSTING_BILLING_STEP` | No | Billing threshold (default: 50) |

### Source Configuration

`config/sources.json`:

```json
[
  {
    "name": "Wyshbone UI",
    "baseUrl": "https://your-ui-url.repl.co",
    "exportKey": "your-export-key"
  },
  {
    "name": "Wyshbone Supervisor",
    "baseUrl": "https://your-supervisor-url.repl.co",
    "exportKey": "your-export-key"
  }
]
```

### Task Configuration

`config/tasks.json`: Defines project tasks with:
- Task ID, title, description
- App assignment (ui, supervisor, poller, evaluator)
- Layer/group organization
- Status tracking
- Acceptance criteria
- Replit prompts

---

## Deployment

### Local Development

```bash
# Install dependencies
npm install

# Start development server (with Vite HMR)
npm run dev

# Server runs at http://localhost:3000
```

### Production

```bash
# Build React frontend
npm run build

# Start production server
npm start
```

### Smoke Test

Before marking any task complete:

```bash
npm run smoke
```

Tests:
1. Server startup
2. Health check (`GET /status.json`)
3. Tasks API (`GET /tasks.json`)
4. Runs API (`GET /tower/runs`)
5. Behaviour tests (`GET /tower/behaviour-tests`)
6. Event ingestion (`POST /tower/runs/log`)

---

## Appendix

### Sample API Calls

**Log a run event:**
```bash
curl -X POST http://localhost:3000/tower/runs/log \
  -H "Content-Type: application/json" \
  -d '{
    "source": "live_user",
    "userId": "user123",
    "sessionId": "sess456",
    "request": { "inputText": "Find pubs near Leeds" },
    "response": { "outputText": "I found several pubs..." },
    "status": "success",
    "durationMs": 2500
  }'
```

**Create investigation:**
```bash
curl -X POST http://localhost:3000/tower/evaluator/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": "manual",
    "notes": "User reported unexpected response"
  }'
```

**Run behaviour tests:**
```bash
curl -X POST http://localhost:3000/tower/behaviour-tests/run \
  -H "Content-Type: application/json" \
  -d '{ "runAll": true }'
```

### Code Structure

```
wyshbone-control-tower/
├── server.js              # Main Express server
├── server/
│   ├── index.ts           # Entry point (calls server.js)
│   ├── routes.ts          # Base routes
│   ├── routes-*.ts        # Feature-specific routes
│   ├── storage.ts         # Storage interface
│   └── vite.ts            # Vite middleware
├── src/
│   ├── evaluator/         # All evaluator logic
│   │   ├── behaviourTests.ts
│   │   ├── autoDetect.ts
│   │   ├── executeInvestigation.ts
│   │   ├── runDiagnosis.ts
│   │   └── ...
│   └── lib/
│       ├── db.ts          # Database connection
│       └── openai.ts      # OpenAI client
├── client/
│   ├── src/
│   │   ├── App.tsx        # React app entry
│   │   ├── pages/         # Page components
│   │   └── components/    # UI components
│   └── index.html         # SPA entry point
├── shared/
│   └── schema.ts          # Database schema (Drizzle)
├── config/
│   ├── sources.json       # Polling sources
│   └── tasks.json         # Task definitions
├── lib/
│   ├── poller.js          # Source polling logic
│   └── tasks.js           # Task management
└── scripts/
    └── smoke-test.ts      # Smoke test runner
```

### Known Limitations

1. **No agent control**: Tower observes but cannot start/stop agents
2. **Polling-based**: Status updates have 10s delay (not real-time)
3. **Single database**: No read replicas or caching layer
4. **Manual patch application**: Patches must be copied and applied in Replit
5. **No alerting system**: No email/Slack notifications for failures



