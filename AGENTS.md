# Wyshbone Control Tower - Agent Guidelines

This document defines the operating protocol for AI agents working on this codebase.

## 🚨 CRITICAL: QA Gate Requirement

**NO TASK IS COMPLETE UNTIL IT PASSES THE QA GATE.**

Before declaring ANY task done, agents MUST run the full smoke test protocol defined in `.cursor/rules/qa-gate.mdc`.

### Minimum Requirements

1. **Boot the service**: `npm run dev` must start without errors
2. **Ingest a test event**: POST to `/events` must return 200/201
3. **Verify output**: Confirm evaluation/run data is produced
4. **Zero errors**: No 404s, 500s, or uncaught exceptions

### Task-Specific Verification

Based on what changed, add 1-3 specific checks:

- **New endpoint?** → Curl it, verify response
- **Database change?** → Confirm schema/data
- **UI change?** → Navigate and verify render
- **Evaluator logic?** → Trigger and check output

### Failure = Fix = Retry

If any check fails:
1. Diagnose the root cause from logs/errors
2. Fix the issue in code
3. Re-run the FULL smoke test
4. Repeat until green

## QA Report Template

Every completed task MUST include:

```markdown
## QA Report

### Smoke Tests
- [ ] ✅ Tower boots: `npm run dev` → Server running
- [ ] ✅ Event ingestion: POST /events → 200 OK  
- [ ] ✅ Evaluation output: Run logged / investigation created
- [ ] ✅ No errors: Zero 4xx/5xx, no uncaught exceptions

### Task-Specific Checks
- [ ] ✅ [Check 1 based on changes]
- [ ] ✅ [Check 2 based on changes]
- [ ] ✅ [Check 3 based on changes]

### Issues Found & Fixed
- [List any issues discovered and resolutions]

### Files Changed
- `file1.ts`
- `file2.ts`
```

---

## Project Context

**Wyshbone Control Tower** is an evaluation and monitoring service for the Wyshbone ecosystem. It:

- Ingests events from Wyshbone UI and Supervisor
- Runs behaviour tests and evaluations
- Tracks runs and investigations
- Provides dashboards for monitoring

### Key Directories

| Path | Purpose |
|------|---------|
| `server.js` | Main Express server |
| `src/evaluator/` | Evaluation logic, investigations |
| `src/services/` | Core services (event intake) |
| `client/` | React dashboard |
| `tests/` | Test files and fixtures |
| `config/` | Source configuration |

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Server runs at http://localhost:3000
```

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | POST | Ingest events from sources |
| `/tower/runs` | GET | List recent runs |
| `/tower/runs/log` | POST | Log a live user run |
| `/tower/evaluator/investigate` | POST | Trigger investigation |
| `/tower/behaviour-tests` | GET | List behaviour tests |
| `/dashboard` | GET | React dashboard |
| `/status` | GET | Server-rendered status |

---

## Commit Protocol

After QA passes:

1. Stage all changes: `git add -A`
2. Commit with descriptive message
3. Push to the appropriate branch

For major features, commit to feature branches. For QA gate and agent guidelines, commit to `main`.

---

## Questions?

If unclear on requirements, check:
1. `.cursor/rules/qa-gate.mdc` for QA protocol
2. `docs/` folder for feature documentation
3. Existing code patterns in `src/evaluator/`

