# Tower Judge Debug Report

## 1. Judgement Endpoint

| Item | Value |
|------|-------|
| **Endpoint** | `POST /api/tower/tower-verdict` |
| **File** | `server/routes-tower-verdict.ts` |
| **Core logic** | `src/evaluator/towerVerdict.ts` |
| **Health check** | `GET /api/tower/health` |

## 2. Expected Request Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `artefactType` | `"leads_list"` (literal) | Yes | Only `leads_list` accepted |
| `run_id` | `string` | No | Optional. Logged as `"none"` when absent |
| `leads` | `unknown[]` | No | Array of lead objects; missing/non-array triggers `STOP` |
| `success_criteria.target_count` | `positive integer` | No | Defaults to `20` when omitted |

**Is `run_id` present in the schema?** Yes (optional string). Supervisor should send it so Tower can correlate requests to runs in logs.

## 3. Logging

Every inbound request produces one structured log line:

```
[TOWER_IN] run_id=<run_id|none> verdict=<ACCEPT|RETRY|CHANGE_PLAN|STOP> requested=<N> delivered=<N>
```

Example output:
```
[TOWER_IN] run_id=run_abc123 verdict=ACCEPT requested=20 delivered=25
[TOWER_IN] run_id=none verdict=RETRY requested=20 delivered=3
```

## 4. Verdict Rules (deterministic)

| Condition | Verdict | Confidence |
|-----------|---------|------------|
| `delivered >= target_count` | `ACCEPT` | 80-95 |
| `delivered / target_count >= 0.5` | `CHANGE_PLAN` | 50-80 |
| `delivered / target_count < 0.5` | `RETRY` | 30-50 |
| leads missing or not an array | `STOP` | 100 |
