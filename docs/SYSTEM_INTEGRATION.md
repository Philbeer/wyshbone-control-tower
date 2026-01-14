# Wyshbone System Integration Analysis

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [API Connection Map](#api-connection-map)
5. [Database Relationships](#database-relationships)
6. [Authentication Flow](#authentication-flow)
7. [Configuration Management](#configuration-management)
8. [Communication Protocols](#communication-protocols)
9. [Error Handling](#error-handling)
10. [Deployment Architecture](#deployment-architecture)

---

## Executive Summary

The Wyshbone ecosystem consists of three interconnected repositories that work together to provide an AI-powered lead generation and business intelligence platform:

1. **Wyshbone UI** - User-facing chat interface and frontend application
2. **Wyshbone Supervisor** - Backend orchestration, API integrations, and agent execution
3. **Wyshbone Control Tower** (this repo) - Monitoring, evaluation, and quality assurance

These systems communicate through a combination of:
- **HTTP REST APIs** for event ingestion and data exchange
- **Polling mechanisms** for status monitoring
- **Shared authentication keys** for secure cross-service communication
- **Separate databases** (each repo has its own, Tower tracks metadata about the others)

Tower acts as a **passive observer** - it receives events from UI, polls status from both UI and Supervisor, but does not directly control or modify either system.

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER LAYER                                      │
│                                                                             │
│    ┌─────────────┐                                 ┌─────────────────────┐  │
│    │   Browser   │─────────────────────────────────│  Tower Dashboard    │  │
│    │   (React)   │                                 │  (React + HTML)     │  │
│    └──────┬──────┘                                 └──────────┬──────────┘  │
└───────────┼──────────────────────────────────────────────────┼──────────────┘
            │                                                   │
            ▼                                                   ▼
┌───────────────────────┐                          ┌───────────────────────────┐
│                       │                          │                           │
│    WYSHBONE UI        │                          │    CONTROL TOWER          │
│                       │                          │                           │
│  • Chat interface     │──────────────────────────│  • Status dashboard       │
│  • Claude integration │    POST /tower/runs/log  │  • Evaluator console      │
│  • Tool execution     │    (conversation events) │  • Investigation view     │
│  • User sessions      │                          │  • Behaviour tests        │
│                       │◄─────────────────────────│                           │
│                       │    GET /export/status    │                           │
│                       │    (polling every 10s)   │                           │
└───────────┬───────────┘                          └─────────────┬─────────────┘
            │                                                     │
            │ API calls for                                       │ GET /export/status
            │ tool execution                                      │ (polling every 10s)
            │                                                     │
            ▼                                                     ▼
┌───────────────────────┐                          ┌───────────────────────────┐
│                       │                          │                           │
│  WYSHBONE SUPERVISOR  │                          │       DATABASES           │
│                       │◄─────────────────────────│                           │
│  • Agent orchestration│    (future integration)  │  UI DB (Supabase?)        │
│  • External APIs      │                          │  Supervisor DB            │
│  • Places search      │                          │  Tower DB (Neon)          │
│  • Email handling     │                          │                           │
│  • Business logic     │                          │  • runs                   │
│                       │                          │  • investigations         │
└───────────────────────┘                          │  • behaviour_tests        │
                                                   │  • patch_evaluations      │
                                                   └───────────────────────────┘
```

### Component Responsibilities

| System | Primary Responsibility | Interacts With |
|--------|----------------------|----------------|
| **UI** | User interaction, chat interface, Claude API integration | Tower (sends events), Supervisor (API calls) |
| **Supervisor** | Backend processing, external APIs, agent logic | UI (receives requests), Tower (status polling) |
| **Tower** | Observability, quality assurance, issue detection | UI (receives events, polls), Supervisor (polls) |

---

## Data Flow Diagrams

### User-Initiated Chat Action

```
User types "Find pubs in Leeds"
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ WYSHBONE UI                                                    │
│                                                                │
│  1. AgentChatPanel.tsx receives user input                    │
│  2. Calls Claude API via chat endpoint                        │
│  3. Claude returns tool_use (places_search)                   │
│  4. UI calls /api/places/search                               │
│                                                                │
└───────────────────────┬───────────────────────────────────────┘
                        │ POST /api/places/search
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ WYSHBONE SUPERVISOR                                            │
│                                                                │
│  5. Receives search request                                   │
│  6. Calls Google Places API / internal search                 │
│  7. Returns structured results                                │
│                                                                │
└───────────────────────┬───────────────────────────────────────┘
                        │ Response: { places: [...] }
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ WYSHBONE UI                                                    │
│                                                                │
│  8. Receives search results                                   │
│  9. Formats response for user                                 │
│  10. Logs conversation event to Tower                         │
│                                                                │
└───────────────────────┬───────────────────────────────────────┘
                        │ POST /tower/runs/log
                        │ {
                        │   source: "live_user",
                        │   userId: "user123",
                        │   request: { inputText: "Find pubs..." },
                        │   response: { outputText: "I found..." },
                        │   status: "success",
                        │   durationMs: 2500,
                        │   meta: { messages: [...] }
                        │ }
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ CONTROL TOWER                                                  │
│                                                                │
│  11. Validates and normalizes payload                         │
│  12. Creates run record in database                           │
│  13. If status="error", auto-triggers investigation           │
│  14. If meta.messages exists, runs conversation quality       │
│      analysis (EVAL-009)                                      │
│  15. Returns { id, conversationRunId, status }                │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

### Tower Polling Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│ CONTROL TOWER - Polling Cycle (every 10 seconds)               │
└─────────────────────────────────────────────────────────────────┘
        │
        ├──────────────────────────────────────────┐
        │                                          │
        ▼                                          ▼
┌───────────────────────┐              ┌───────────────────────┐
│ GET /export/status.json│              │ GET /export/status.json│
│ to Wyshbone UI        │              │ to Wyshbone Supervisor│
│                       │              │                       │
│ Headers:              │              │ Headers:              │
│ X-EXPORT-KEY: xxx     │              │ X-EXPORT-KEY: yyy     │
└───────────┬───────────┘              └───────────┬───────────┘
            │                                      │
            ▼                                      ▼
┌───────────────────────┐              ┌───────────────────────┐
│ Response:             │              │ Response:             │
│ {                     │              │ {                     │
│   quality: {          │              │   quality: {          │
│     clevernessIndex   │              │     clevernessIndex   │
│   },                  │              │   },                  │
│   totals: {           │              │   totals: {           │
│     loc, todo, fixme  │              │     loc, todo, fixme  │
│   },                  │              │   },                  │
│   ui001_done: true,   │              │   sup001_done: false  │
│   ...                 │              │   ...                 │
│ }                     │              │ }                     │
└───────────┬───────────┘              └───────────┬───────────┘
            │                                      │
            └────────────────┬─────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ CONTROL TOWER - Post-Poll Processing                           │
│                                                                 │
│ 1. Store snapshot in memory (max 50 per source)                │
│ 2. Compute deltas from previous snapshot                       │
│ 3. Check task acceptance criteria:                             │
│    - Convention flags (ui001_done, sup001_done)                │
│    - Custom acceptance keys                                    │
│    - File content checks                                       │
│ 4. Auto-mark tasks as "done" if criteria met                   │
│ 5. Update /status dashboard with new data                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Behaviour Test Execution

```
┌─────────────────────────────────────────────────────────────────┐
│ CONTROL TOWER - Behaviour Test Execution                        │
│                                                                 │
│ POST /tower/behaviour-tests/run { runAll: true }               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
        │
        │ For each active test (greeting, personalisation, etc.)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ POST /api/tower/chat-test to Wyshbone UI                      │
│                                                               │
│ Request:                                                      │
│ {                                                             │
│   user: { id: "tower-eval", name: "Tower Evaluator" },        │
│   messages: [{ role: "user", content: "Hello" }]              │
│ }                                                             │
│                                                               │
│ Headers:                                                      │
│ X-EXPORT-KEY: <ui-export-key>                                 │
│                                                               │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ WYSHBONE UI - Chat Test Endpoint                              │
│                                                               │
│ 1. Processes request through chat pipeline                    │
│ 2. Calls Claude API                                           │
│ 3. Returns response (streaming or JSON)                       │
│                                                               │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ CONTROL TOWER - Test Evaluation                               │
│                                                               │
│ 1. Parse response (handle streaming SSE format)               │
│ 2. Apply test-specific heuristics:                            │
│    - greeting: check for welcome + goal question              │
│    - personalisation: check domain acknowledgment             │
│    - lead-search: check for search indication                 │
│ 3. Determine PASS / FAIL / ERROR                              │
│ 4. Record test run in database                                │
│ 5. Auto-detect issues and trigger investigation if needed     │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Connection Map

### UI → Supervisor Connections (Expected)

Based on Tower's observation and typical patterns:

| UI Endpoint Call | Supervisor Endpoint | Purpose |
|-----------------|---------------------|---------|
| POST /api/places/search | /api/places/search | Search for leads |
| POST /api/deep-research | /api/execute-action | Deep research execution |
| POST /api/company-info | /api/company-info | Company data lookup |

*Note: These are inferred from Tower's context; actual implementation is in UI/Supervisor repos.*

### UI → Tower Connections (Verified)

| UI Action | Tower Endpoint | Method | Purpose |
|-----------|---------------|--------|---------|
| After chat completion | `/tower/runs/log` | POST | Log conversation event |
| Flag conversation | `/tower/conversations/:id/flag` | POST | Manual quality flag |
| View dashboard | `/dashboard` | GET | Evaluator console |

### Tower → UI Connections (Verified)

| Tower Action | UI Endpoint | Method | Purpose |
|--------------|-------------|--------|---------|
| Status polling | `/export/status.json` | GET | Get code metrics |
| File fetch | `/export/file?path=...` | GET | Get source file content |
| Behaviour test | `/api/tower/chat-test` | POST | Execute test conversation |

### Tower → Supervisor Connections (Verified)

| Tower Action | Supervisor Endpoint | Method | Purpose |
|--------------|---------------------|--------|---------|
| Status polling | `/export/status.json` | GET | Get code metrics |
| File fetch | `/export/file?path=...` | GET | Get source file content |

### Tower Internal API Summary

```
/tower/runs                        GET     List recent runs
/tower/runs/live                   GET     List live user runs
/tower/runs/log                    POST    ★ Main event ingestion
/tower/runs/:id                    GET     Get specific run
/tower/runs/:id/flag               POST    Flag a run
/tower/runs/:id/investigate        POST    Create investigation

/tower/conversations               GET     List conversations
/tower/conversations/:id/events    GET     Get conversation events
/tower/conversations/:id/flag      POST    Flag conversation

/tower/behaviour-tests             GET     List tests with results
/tower/behaviour-tests/run         POST    Execute tests
/tower/behaviour-tests/:id/investigate POST Investigate test

/tower/evaluator/investigate       POST    Create investigation
/tower/evaluator/investigations    GET     List investigations
/tower/evaluator/investigations/:id GET    Get investigation

/tower/investigations/:id/evaluate POST    Run AI evaluation
/tower/investigations/:id/generate-prompt POST Generate patch prompt

/tower/patch/submit                POST    Submit patch for evaluation
/tower/patch/:id                   GET     Get patch evaluation
/tower/patch/approve/:id           POST    Approve patch

/tower/manual-flags                GET     List manual flags
/tower/reset-investigations        POST    Clear all data
```

---

## Database Relationships

### Tower Database Schema (Neon PostgreSQL)

```sql
-- runs: Event tracking from UI
CREATE TABLE runs (
    id VARCHAR PRIMARY KEY,
    conversation_run_id TEXT,        -- Groups events in same conversation
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    source TEXT NOT NULL,            -- 'live_user', 'UI', 'SUP', etc.
    user_identifier TEXT,
    goal_summary TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    meta JSONB                       -- Full event payload
);

-- investigations: Diagnostic investigations
CREATE TABLE investigations (
    id VARCHAR PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    trigger TEXT NOT NULL,           -- 'manual', 'timeout', 'behaviour_flag', etc.
    run_id TEXT,                     -- Links to runs.id or conversation_run_id
    notes TEXT,
    run_logs JSONB NOT NULL,
    run_meta JSONB,                  -- Investigation context
    ui_snapshot JSONB,               -- Code snapshot from UI
    supervisor_snapshot JSONB,       -- Code snapshot from Supervisor
    diagnosis TEXT,                  -- AI-generated diagnosis
    patch_suggestion TEXT,           -- AI-generated fix
    replit_patch_prompt TEXT,        -- Formatted for Replit
    approved_at TIMESTAMP
);

-- behaviour_tests: Test definitions
CREATE TABLE behaviour_tests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    is_active TEXT NOT NULL DEFAULT 'true'
);

-- behaviour_test_runs: Test execution history
CREATE TABLE behaviour_test_runs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    test_id TEXT NOT NULL,           -- Links to behaviour_tests.id
    status TEXT NOT NULL,            -- 'pass', 'fail', 'error'
    details TEXT,
    raw_log JSONB,
    build_tag TEXT,
    duration_ms TEXT
);

-- patch_evaluations: Patch evaluation results
CREATE TABLE patch_evaluations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL,            -- 'pending', 'approved', 'rejected'
    patch_text TEXT NOT NULL,
    diff JSONB,
    reasons JSONB,                   -- String array
    test_results_before JSONB,
    test_results_after JSONB,
    investigation_ids JSONB,
    evaluation_meta JSONB
);
```

### Data Flow Between Tables

```
User Chat Event (from UI)
        │
        ▼
    ┌───────┐
    │ runs  │─────────────────────────────────┐
    └───┬───┘                                 │
        │                                     │
        │ If error/flagged                    │ run_id reference
        ▼                                     │
┌───────────────┐                             │
│investigations │◄────────────────────────────┘
└───────┬───────┘
        │
        │ If patch suggested
        ▼
┌───────────────────┐
│patch_evaluations  │
└───────────────────┘
```

### Cross-Repository Data Access

| Table | Written By | Read By |
|-------|-----------|---------|
| runs | Tower (from UI events) | Tower |
| investigations | Tower | Tower |
| behaviour_tests | Tower (seeded) | Tower |
| behaviour_test_runs | Tower | Tower |

**Important**: Tower maintains its own database. It does NOT write to UI or Supervisor databases. UI and Supervisor databases are separate and managed by their respective applications.

---

## Authentication Flow

### Current Authentication Model

```
┌──────────────────────────────────────────────────────────────────┐
│ EXPORT KEY AUTHENTICATION (Source Polling & Behaviour Tests)     │
│                                                                  │
│ Tower → UI:                                                      │
│   GET /export/status.json                                        │
│   Header: X-EXPORT-KEY: <ui-export-key>                          │
│                                                                  │
│ Tower → Supervisor:                                              │
│   GET /export/status.json                                        │
│   Header: X-EXPORT-KEY: <supervisor-export-key>                  │
│                                                                  │
│ Keys stored in: config/sources.json                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TOWER API KEY (Optional - for external callers)                  │
│                                                                  │
│ External → Tower:                                                │
│   POST /tower/runs/log                                           │
│   Header: X-TOWER-API-KEY: <tower-api-key> (optional)            │
│                                                                  │
│ Currently: No mandatory authentication on ingestion endpoint     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ CORS CONFIGURATION                                               │
│                                                                  │
│ Allowed Origins:                                                 │
│   - http://localhost:3000                                        │
│   - http://localhost:5173                                        │
│   - http://localhost:5000                                        │
│   - process.env.FRONTEND_URL                                     │
│   - process.env.UI_URL                                           │
│   - process.env.SUPERVISOR_URL                                   │
│   - *.vercel.app                                                 │
│   - *.onrender.com                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### User Authentication

Tower does **not** handle user authentication directly. User sessions are managed by UI:

1. User logs in via UI (Supabase/custom auth)
2. UI tracks userId and sessionId
3. UI includes userId/sessionId in events sent to Tower
4. Tower stores these identifiers for correlation but doesn't validate them

---

## Configuration Management

### Environment Variables

| Variable | Repo | Shared/Specific | Purpose |
|----------|------|-----------------|---------|
| `DATABASE_URL` | Tower | Specific | Neon PostgreSQL connection |
| `OPENAI_API_KEY` | Tower | Specific | AI analysis |
| `PORT` | All | Specific | Server port |
| `NODE_ENV` | All | Shared pattern | development/production |
| `UI_EXPORT_KEY` | UI | Shared (in Tower config) | Export API auth |
| `SUP_EXPORT_KEY` | Supervisor | Shared (in Tower config) | Export API auth |

### Configuration Files

**Tower-specific:**
- `config/sources.json` - Defines UI/Supervisor URLs and export keys
- `config/tasks.json` - Task definitions for project management
- `drizzle.config.ts` - Database schema configuration

### Feature Flags

Currently, Tower does **not** have a formal feature flag system. Behaviour is controlled by:

1. Environment variables (e.g., `EVAL_MODEL_ID`)
2. Test definition `isActive` field
3. Code-level constants (e.g., `TIMEOUT_THRESHOLD_MS`)

---

## Communication Protocols

### HTTP REST

All inter-service communication uses HTTP REST:

| Protocol | Use Case | Format |
|----------|----------|--------|
| HTTP/HTTPS | All API calls | JSON |
| SSE | Chat test responses (optional) | text/event-stream |

### Event Payload Format

Standard event payload from UI to Tower:

```typescript
interface WyshboneEvent {
  // Identification
  runId?: string;              // Conversation ID
  source: string;              // 'live_user'
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  
  // Request/Response
  request?: {
    inputText: string;
    toolCalls?: Array<{ name: string; args?: any }>;
  };
  response?: {
    outputText: string;
    toolResultsSummary?: string;
  };
  
  // Metadata
  status: 'success' | 'error' | 'timeout' | 'fail';
  goal?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs: number;
  model?: string;
  mode?: string;
  
  // For conversation analysis
  meta?: {
    messages?: Array<{ role: string; content: string }>;
    [key: string]: any;
  };
}
```

---

## Error Handling

### Event Ingestion Errors

Tower uses `runIngestionValidator.ts` to:

1. Validate required fields (source, status, durationMs)
2. Normalize payload format
3. Log warnings for missing metadata (userId, sessionId)
4. Generate unique IDs if not provided

### Polling Errors

When polling fails:
- 10-second timeout per request
- Error stored in snapshot with `success: false`
- Dashboard shows ERROR badge for that source
- Polling continues for other sources

### Investigation Errors

If AI analysis fails:
- Error logged to console
- Investigation still created (without diagnosis)
- Manual retry available via API

---

## Deployment Architecture

### Current Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│ Replit (Hosting)                                                 │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Wyshbone UI    │  │   Supervisor    │  │ Control Tower   │  │
│  │  (Replit VM)    │  │  (Replit VM)    │  │  (Replit VM)    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼─────────────────────┼─────────────────────┼─────────┘
            │                     │                     │
            └──────────┬──────────┴──────────┬──────────┘
                       │                     │
                       ▼                     ▼
              ┌─────────────────┐   ┌─────────────────┐
              │   Neon DB       │   │   OpenAI API    │
              │  (PostgreSQL)   │   │                 │
              └─────────────────┘   └─────────────────┘
```

### Alternative Deployment Options

Tower is designed to run on:
- **Replit** (current) - Development and staging
- **Vercel** - Serverless functions (limited)
- **Render** - Container hosting
- **Any Node.js host** - With PostgreSQL access

### Required Services

| Service | Required | Purpose |
|---------|----------|---------|
| PostgreSQL (Neon) | Yes | Data persistence |
| OpenAI API | Yes | AI analysis |
| UI Export API | Yes | Status polling |
| Supervisor Export API | Yes | Status polling |

---

## Appendix: Integration Checklist

### For UI Developers

To integrate with Tower:

1. **Send events to Tower:**
```javascript
await fetch('https://tower-url/tower/runs/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'live_user',
    userId: user.id,
    sessionId: session.id,
    request: { inputText: userMessage },
    response: { outputText: assistantResponse },
    status: 'success',
    durationMs: endTime - startTime,
    meta: { messages: conversationHistory }
  })
});
```

2. **Expose export endpoints:**
- `GET /export/status.json` - Return code metrics
- `GET /export/file?path=...` - Return file contents
- `POST /api/tower/chat-test` - Handle test chat requests

3. **Authentication:**
- Generate an export key
- Add to Tower's `config/sources.json`
- Validate `X-EXPORT-KEY` header on export endpoints

### For Supervisor Developers

To integrate with Tower:

1. **Expose export endpoint:**
```javascript
app.get('/export/status.json', (req, res) => {
  if (req.headers['x-export-key'] !== process.env.EXPORT_KEY) {
    return res.status(403).json({ error: 'Invalid export key' });
  }
  res.json({
    quality: { clevernessIndex: calculateCleverness() },
    totals: { loc: countLOC(), todo: countTODOs(), fixme: countFIXMEs() },
    sup001_done: features.isComplete('SUP-001'),
    // ... other task flags
  });
});
```

2. **Configure Tower:**
- Add Supervisor URL and export key to Tower's `config/sources.json`

### Environment Setup

Tower requires:
```bash
# Required
DATABASE_URL=postgresql://user:pass@host/dbname
OPENAI_API_KEY=sk-...

# Optional
PORT=3000
NODE_ENV=development
EVAL_MODEL_ID=gpt-4o-mini
```



