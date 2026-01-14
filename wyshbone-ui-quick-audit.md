# Wyshbone Control Tower - Architecture Quick Audit

**Audited:** January 3, 2026  
**Repository:** `wyshbone-control-tower`

---

## 1. File Structure

```
wyshbone-control-tower/
├── server.js              # Main Express server entry point (huge file ~1700 lines)
├── server/                # Server-side route modules
│   ├── routes-*.ts        # API route modules (patch, dev-issues, investigations, etc.)
│   ├── vite.ts            # Vite dev/prod middleware
│   └── storage.ts         # Legacy storage
├── src/
│   ├── evaluator/         # 🔑 MAIN AGENT/EVALUATION LOGIC (30+ files)
│   │   ├── behaviourTests.ts          # Test definitions & execution
│   │   ├── runStore.ts                # Run tracking/storage
│   │   ├── executeInvestigation.ts    # Investigation orchestration
│   │   ├── autoDetect.ts              # Auto-trigger investigations
│   │   └── [many more...]
│   └── lib/
│       ├── db.ts          # Drizzle PostgreSQL connection (Neon)
│       └── openai.ts      # OpenAI client
├── client/                # React frontend (Vite + shadcn/ui)
│   └── src/
│       ├── components/    # UI components (EvaluatorConsole, cards, etc.)
│       ├── pages/         # status-dashboard, investigate, dev-issues
│       └── lib/           # API clients
├── shared/
│   └── schema.ts          # 🔑 DATABASE SCHEMA (Drizzle definitions)
├── config/
│   ├── sources.json       # External service URLs (UI, Supervisor)
│   └── tasks.json         # Task definitions for roadmap
├── lib/
│   ├── poller.js          # Polls external services for status
│   └── tasks.js           # Task management
└── tests/                 # Test files
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/evaluator/` | **Agent brain** - investigations, diagnosis, patches, behaviour tests |
| `server/routes-*.ts` | Express route modules (modular endpoints) |
| `client/` | React dashboard for monitoring |
| `config/` | External service configs & task definitions |
| `lib/` | Polling & task management utilities |

---

## 2. Database (PostgreSQL via Drizzle)

**Connection:** `DATABASE_URL` env var → Neon serverless PostgreSQL

### Tables

| Table | Purpose | Agent-Related? |
|-------|---------|----------------|
| `users` | Basic user auth | ❌ |
| `runs` | **Run tracking** - source, user, goal, status, meta | ✅ |
| `investigations` | **Investigation records** - diagnosis, patches, snapshots | ✅ |
| `behaviour_tests` | Test definitions (greeting, lead-search, etc.) | ✅ |
| `behaviour_test_runs` | Test execution history | ✅ |
| `patch_evaluations` | Patch evaluation results | ✅ |
| `patch_suggestions` | AI-suggested code patches | ✅ |
| `dev_issues` | Developer-reported issues | ⚡ (Dev workflow) |
| `dev_issue_context` | Context/files for dev issues | ⚡ (Dev workflow) |
| `dev_issue_patches` | Patches for dev issues | ⚡ (Dev workflow) |

### Agent-Related Tables Summary
- **8 tables** directly related to agent/evaluation functionality
- **1 table** (`users`) for basic auth only

---

## 3. API Endpoints (Agent-Related)

### Run Tracking (`/tower/runs`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tower/runs` | GET | List recent runs |
| `/tower/runs/live` | GET | List live user runs (EVAL-008) |
| `/tower/runs/:id` | GET | Get run by ID |
| `/tower/runs` | POST | Create new run |
| `/tower/runs/log` | POST | **Log live run event** (main ingestion endpoint) |
| `/tower/runs/:runId/investigate` | POST | Trigger investigation for a run |

### Investigations (`/tower/evaluator`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tower/evaluator/investigate` | POST | Create/execute investigation |
| `/tower/evaluator/investigations` | GET | List all investigations |
| `/tower/evaluator/investigations/:id` | GET | Get investigation details |

### Behaviour Tests (`/tower/behaviour-tests`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tower/behaviour-tests` | GET | List tests with latest runs |
| `/tower/behaviour-tests/run` | POST | Execute behaviour test(s) |
| `/tower/behaviour-tests/:testId/investigate` | POST | Investigate a specific test |

### Patches & Junior Dev (`/tower/patch`, `/tower/junior-dev`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tower/patch/*` | Various | Patch evaluation/suggestion |
| `/tower/junior-dev/*` | Various | Junior dev workflow |
| `/tower/patch-failures/*` | Various | EVAL-016: Patch failure analysis |

### Conversation Quality (`/tower/conversation-quality`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tower/conversation-quality/*` | Various | Manual quality flagging |
| `/tower/auto-conversation-quality/*` | Various | EVAL-009: Auto-analysis |

### Conversations (Event-Level)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tower/conversations` | GET | List conversations |
| `/tower/conversations/:id/events` | GET | Get conversation events |

### Dev Issues (`/api/dev`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dev/issues` | GET/POST | Dev issue management |
| `/api/dev/issues/:id/patches` | Various | Patches for dev issues |

---

## 4. Integration Points

### External Services (Polled)

**Config:** `config/sources.json`

| Service | Purpose | How Integrated |
|---------|---------|----------------|
| **Wyshbone UI** | Main user-facing chatbot | Polled via `/export/status.json`, `/export/file` |
| **Wyshbone Supervisor** | Agent orchestration | Polled via same endpoints |

### API Calls TO Other Services

```typescript
// From lib/poller.js - polls these URLs:
`${source.baseUrl}/export/status.json`   // Status polling
`${source.baseUrl}/export/file?path=...` // File content fetching

// From src/evaluator/behaviourTests.ts - calls:
`${uiSource.baseUrl}/api/tower/chat-test` // Test the chat API

// From src/evaluator/fetchSnapshots.ts - calls:
WYSHBONE_UI_SNAPSHOT_URL         // Default: http://wyshbone-ui/internal/code-snapshot
WYSHBONE_SUPERVISOR_SNAPSHOT_URL // Default: http://wyshbone-supervisor/internal/code-snapshot
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (Neon) |
| `OPENAI_API_KEY` | OpenAI for diagnosis/analysis |
| `EVAL_MODEL_ID` | Model override (default: `gpt-4o-mini`) |
| `WYSHBONE_UI_SNAPSHOT_URL` | UI code snapshot endpoint |
| `WYSHBONE_SUPERVISOR_SNAPSHOT_URL` | Supervisor code snapshot |
| `PORT` | Server port (default: 3000) |
| `FRONTEND_URL`, `UI_URL`, `SUPERVISOR_URL` | CORS allowed origins |
| `HOSTING_USAGE_USD`, `HOSTING_BILLING_STEP` | Usage tracking display |

### Cross-Repo Communication

Tower **receives** events from:
- **Wyshbone UI** → `POST /tower/runs/log`
- **Wyshbone Supervisor** → `POST /tower/runs/log`

Tower **polls** data from:
- **Wyshbone UI** → `/export/status.json`, `/export/file`
- **Wyshbone Supervisor** → Same endpoints

Tower **calls** for tests:
- **Wyshbone UI** → `/api/tower/chat-test`

---

## 5. Current Agent Features

### ✅ Working Features

| Feature | Files | Status |
|---------|-------|--------|
| **Run Ingestion** | `runStore.ts`, `runIngestionValidator.ts` | Working |
| **Investigation System** | `executeInvestigation.ts`, `storeInvestigation.ts` | Working |
| **Behaviour Tests** | `behaviourTests.ts`, `behaviourTestStore.ts` | Working - 4 tests defined |
| **Auto-Detection** | `autoDetect.ts` | Working - triggers on failure/timeout |
| **Diagnosis (LLM)** | `runDiagnosis.ts` | Working - uses GPT-4o-mini |
| **Conversation Quality** | `conversationQualityAnalysis.ts` | Working |
| **Auto Conv. Quality** | `autoConversationQualityAnalysis.ts` | Working (EVAL-009) |
| **Patch Evaluation** | `patchEvaluator.ts`, `patchGate.ts` | Working |
| **Patch Failure Analysis** | `patchFailureAnalysis.ts` | Working (EVAL-016) |
| **Dev Issues** | `devIssueContextService.ts`, `devIssuePatchService.ts` | Working |
| **Status Polling** | `lib/poller.js` | Working |

### Behaviour Tests Defined

```typescript
// From behaviourTests.ts
- "greeting-basic"         // Greeting / onboarding flow
- "personalisation-domain" // Domain-aware responses
- "lead-search-basic"      // Lead search functionality
- "monitor-setup-basic"    // Monitoring setup
```

### Investigation Triggers

```typescript
type InvestigationTrigger =
  | "manual"                    // User-initiated
  | "manual-from-run"           // From run detail page
  | "timeout"                   // Auto-detect timeout
  | "tool_error"                // Auto-detect error
  | "behaviour_flag"            // Behaviour test failure
  | "conversation_quality"      // Manual quality flag
  | "auto_conversation_quality" // EVAL-009 auto-analysis
  | "patch_failure";            // EVAL-016 patch failure
```

### React Dashboard Components

| Component | Purpose |
|-----------|---------|
| `EvaluatorConsole` | Main dashboard |
| `BehaviourTestsCard` | Test status/execution |
| `LiveUserRunsCard` | Live run monitoring |
| `ConversationQualityCard` | Quality flags |
| `AutoConversationQualityCard` | Auto-analysis results |
| `PatchFailuresCard` | Patch failure tracking |
| `ManualFlagsCard` | Manual flags |

---

## Summary

**Wyshbone Control Tower** is an **agent evaluation & monitoring service** that:

1. **Ingests** run events from Wyshbone UI and Supervisor
2. **Monitors** those services via polling
3. **Runs** behaviour tests against UI chat API
4. **Investigates** failures automatically or manually
5. **Diagnoses** issues using LLM (GPT-4o-mini)
6. **Suggests** patches and tracks their evaluation
7. **Displays** everything in a React dashboard

**Primary Integration Points:**
- Receives events FROM: `wyshbone-ui`, `wyshbone-supervisor`
- Polls/tests: `wyshbone-ui`, `wyshbone-supervisor`
- Uses: OpenAI API, Neon PostgreSQL

**Database:** 9 tables, 8 agent-related, Drizzle ORM

**Tech Stack:** Express + React + Vite + Drizzle + shadcn/ui + OpenAI


