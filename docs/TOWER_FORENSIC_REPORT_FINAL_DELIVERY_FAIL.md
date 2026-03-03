# Tower Forensic Report: final_delivery FAIL Despite delivered=30

**Date**: 2026-03-03

**Run Facts**:
- `final_delivery` artefact claims: 30 leads delivered, `verified_exact=30`, `requested=10`
- Tower Judgement: **FAIL** with message _"No results were found that meet the stated requirements."_
- Delivery Summary: `STOP — 30 of 10 delivered`

---

## A) Where final_delivery Judgement Is Implemented

### Entry Points (two routes can trigger it)

| Route file | Endpoint | Relevant lines | Role |
|---|---|---|---|
| `server/routes-judge-artefact.ts` | `POST /judge-artefact` | L459, L569–576 | Primary path for DB-backed artefact judgement. Fetches artefact row from `artefacts` table by `artefactId`, parses `payload_json`, then calls `judgeLeadsListArtefact()`. |
| `server/routes-tower-verdict.ts` | `POST /tower-verdict` | L149, L510–545 | Direct-payload path. Accepts inline fields (leads, constraints, etc.) and calls `judgeLeadsList()` directly. |

Both routes treat `"final_delivery"` identically to `"leads_list"`:

```typescript
// routes-judge-artefact.ts, line 459
if (artefactType === "leads_list" || artefactType === "final_delivery") {
```

```typescript
// routes-tower-verdict.ts, line 149
artefactType: z.enum(["leads_list", "final_delivery"]),
```

### Core Rubric Functions

| Function | File | Line | Purpose |
|---|---|---|---|
| `judgeLeadsList()` | `src/evaluator/towerVerdict.ts` | L1022 | Wrapper: calls `judgeLeadsListCore()`, then applies evidence-quality gate, relationship-predicate gate, certainty backstop, constraint gate, truth gate, and time-predicate gate. |
| `judgeLeadsListCore()` | `src/evaluator/towerVerdict.ts` | L1384 | Core decision tree: resolves counts, evaluates constraints, returns verdict. |
| `judgeEvidenceQuality()` | `src/evaluator/evidenceQualityJudge.ts` | L84 | Post-hoc gate: checks if leads carry verification data (verified, evidence, source_url fields). Can override ACCEPT→STOP. |
| `judgeLeadsListArtefact()` | `server/routes-judge-artefact.ts` | L152 | Bridge function (judge-artefact route only): extracts leads, constraints, counts from the DB `payload_json` and `successCriteria`, then calls `judgeLeadsList()`. |

---

## B) Expected Schema for final_delivery

### Fields Tower Reads (via `TowerVerdictInput`, L159–217)

```
leads                        Lead[]         — array of {name: string, ...}
requested_count_user         number | null  — user's original requested count
requested_count              number | null  — fallback
constraints                  Constraint[]   — typed constraint objects
verification_summary         {verified_exact_count: number, constraint_results?: [...]}
delivered                    DeliveredInfo | number — delivery counters
delivered_count              number         — fallback
accumulated_count            number         — fallback
success_criteria             {requested_count_user?, target_count?, hard_constraints?, ...}
meta                         {plan_version?, replans_used?, max_replans?, radius_km?, ...}
attempt_history              [{plan_version, radius_km, delivered_count}, ...]
hard_constraints             string[]       — legacy format
soft_constraints             string[]       — legacy format
structured_constraints       StructuredConstraint[]
attribute_evidence           AttributeEvidenceArtefact[]
artefact_title               string
artefact_summary             string
delivery_summary             "PASS" | "PARTIAL" | "STOP"
requires_relationship_evidence  boolean
verified_relationship_count  number
time_predicates              [{predicate, hardness}, ...]
unresolved_hard_constraints  [{constraint_id, label, verifiability, ...}, ...]
best_effort_accepted         boolean
```

### How `delivered_count` Is Computed

Function: `resolveDeliveredCount()` — `src/evaluator/towerVerdict.ts` L269–291

**Priority order (first non-null wins):**

1. `input.verification_summary.verified_exact_count` — if CVL (cross-verification layer) is present (`hasCvl()` returns true)
2. `input.delivered.delivered_matching_accumulated` — if `delivered` is an object
3. `matchedLeadCount` — locally computed by filtering `leads[]` against NAME_CONTAINS/NAME_STARTS_WITH constraints (only if > 0)
4. `input.delivered.delivered_matching_this_plan`
5. `input.delivered` — if it's a raw number
6. `input.accumulated_count`
7. `input.delivered_count`
8. **Fallback: `0`**

### How `shortfall` Is Computed

There is no explicit `shortfall` field. It is computed implicitly:

```
if (deliveredCount >= requestedCount && requestedCount > 0)  → count satisfied
if (deliveredCount < requestedCount && requestedCount > 0)   → INSUFFICIENT_COUNT
```

(`src/evaluator/towerVerdict.ts` L1558 and L1816)

### How `requestedCount` Is Resolved

Function: `resolveRequestedCount()` — L244–252

Priority: `requested_count_user` → `success_criteria.requested_count_user` → `success_criteria.target_count` → `requested_count` → **null** (triggers STOP/MISSING_REQUESTED_COUNT)

### Hard Constraints Satisfied

Hard constraints are evaluated per-constraint via `evaluateConstraint()` (L366–558). A constraint is a `hardViolation` if:
- `passed === false` AND `hardness === "hard"` AND it is not in the `hardUnknowns` set

Hard unknowns are constraints where CVL or attribute evidence returned status `"unknown"` or `"not_attempted"`.

### Email Requirement Handling

There is **no email-specific logic** in Tower. An email requirement would be modeled as:
- `HAS_ATTRIBUTE` constraint with `value: "email"` and `hardness: "hard"` or `"soft"`

If `hardness: "hard"`:
- Tower looks for CVL constraint_results with matching type/field/value
- Then checks `attribute_evidence` artefacts for per-lead evidence
- If neither CVL nor attribute evidence is found → status = `"not_attempted"`, `passed = false`
- This makes it a **hardUnknown** (not a hardViolation)
- Hard unknowns with ACCEPT trigger: truth gate → STOP (if `best_effort_accepted` is false) or ACCEPT_WITH_UNVERIFIED (if true)

If `hardness: "soft"`:
- Failure does not block ACCEPT; it only appears in `constraint_results` metadata

---

## C) Decision Logic Summary (judgeLeadsListCore, L1384–1926)

```
1. requestedCount = resolveRequestedCount(input)
   └─ if null → STOP (MISSING_REQUESTED_COUNT)

2. checkNoProgress(input)?
   └─ if true → STOP (NO_PROGRESS)
      └─ rationale: ternary on deliveredCount/leads.length
         - deliveredCount > 0 → "Only N exact matches..."
         - leads.length > 0   → "No exact matches... closest alternatives..."
         - ELSE               → ★ "No results were found that meet the stated requirements."

3. detectConcatenationArtifacts(title, summary, goal)?
   └─ if corrupted → CHANGE_PLAN (INPUT_CONCATENATED)

4. Compute: deliveredCount, constraintResults, hardViolations, hardUnknowns

5. if (deliveredCount >= requestedCount && requestedCount > 0):
   5a. if (hardViolations.length > 0):
       └─ ★ EMPTY BLOCK — no return statement (L1559)
       └─ Falls through to step 6
   5b. else if (hardUnknowns.length > 0):
       └─ CHANGE_PLAN or STOP depending on canReplan/unverifiable
   5c. else:
       └─ ACCEPT ✓

6. if (hardViolations.length > 0):
   └─ Various STOP/CHANGE_PLAN paths depending on allHardViolated, canReplan, suggestions
   └─ rationale uses same ternary: deliveredCount > 0 / leads.length > 0 / ELSE
   └─ ALL paths return

7. if (deliveredCount < requestedCount && requestedCount > 0):
   └─ CHANGE_PLAN (if canReplan + suggestions) or STOP
   └─ rationale uses same ternary
   └─ ALL paths return

8. FALLBACK (L1909–1926):
   └─ STOP (INTERNAL_ERROR)
   └─ rationale: ★ "No results were found that meet the stated requirements." (UNCONDITIONAL)
```

### Post-core Gates in `judgeLeadsList()` (L1022–1382)

After `judgeLeadsListCore()` returns, the wrapper applies these gates that can **override ACCEPT → STOP**:

1. **Evidence Quality Gate** (L1041): `judgeEvidenceQuality()` — if leads lack `verified`/`evidence`/`source_url` fields
2. **Relationship Predicate Gate** (L1087): if goal contains relationship language and `verified_relationship_count === 0`
3. **Certainty Backstop** (L1144): if `must_be_certain` constraints are only proxy/unverifiable
4. **Constraint Gate** (L1176): if `unresolved_hard_constraints` exist and aren't best-effort accepted
5. **Truth Gate** (L1324): if any hard constraint_result has status unknown/not_attempted
6. **Time Predicate Gate** (L1249): if hard time predicates are blocked

---

## D) Why This Run Fails Despite delivered=30

### The Exact Message Match

The message _"No results were found that meet the stated requirements."_ appears at these locations in `judgeLeadsListCore()`:

| Line | Trigger condition | Stop code |
|---|---|---|
| L1421 | `checkNoProgress()` AND `deliveredCount === 0` AND `leads.length === 0` | NO_PROGRESS |
| L1778 | hardViolations + CHANGE_PLAN + `deliveredCount === 0` + `leads.length === 0` | HARD_CONSTRAINT_VIOLATED |
| L1841 | INSUFFICIENT_COUNT + CHANGE_PLAN + `deliveredCount === 0` + `leads.length === 0` | INSUFFICIENT_COUNT |
| L1868 | MAX_REPLANS_EXHAUSTED + `deliveredCount === 0` + `leads.length === 0` | MAX_REPLANS_EXHAUSTED |
| L1894 | INSUFFICIENT_COUNT + no suggestions + `deliveredCount === 0` + `leads.length === 0` | INSUFFICIENT_COUNT |
| **L1916** | **INTERNAL_ERROR fallback — UNCONDITIONAL** | **INTERNAL_ERROR** |

In lines 1417–1421, 1774–1778, 1837–1841, 1864–1868, 1890–1894, the message is selected by a ternary:
```typescript
deliveredCount > 0
  ? `Only ${deliveredCount} exact matches were found...`
  : leads.length > 0
    ? "No exact matches were found. Closest alternatives..."
    : "No results were found that meet the stated requirements."
```

This ternary produces the observed message **only when both `deliveredCount === 0` AND `leads.length === 0`**.

Line 1916 produces it **unconditionally** (no ternary).

### Top 3 Hypotheses (Ranked by Likelihood)

---

#### Hypothesis 1 (MOST LIKELY): `leads` array missing from artefact `payload_json`, causing `deliveredCount` to resolve to 0

**Code evidence:**

In `routes-judge-artefact.ts` L160–162, leads are extracted from the DB payload:
```typescript
const leads: Lead[] = Array.isArray(payloadJson?.leads)
  ? payloadJson.leads.filter((l: any) => l && typeof l.name === "string")
  : [];
```

If the `final_delivery` artefact's `payload_json` stored in the `artefacts` table does not contain a `leads` key (or leads lack a `name` field), then `leads = []`.

Then in `resolveDeliveredCount()` (L269–291):
- `hasCvl(input)` checks `input.verification_summary` — but this field must be present in `payloadJson` or merged from a separate `lead_verification` artefact (L460–518). If neither source provides it, `hasCvl()` returns false.
- `matchedLeadCount = null` (since `leads.length === 0`, L1483–1484)
- All `delivered` fallback fields (`delivered_matching_accumulated`, `delivered_count`, etc.) may also be absent from the payload
- **Result: `deliveredCount = 0`**

With `deliveredCount = 0` and `requestedCount = 10`:
- Enters `deliveredCount < requestedCount` path (L1816)
- With `leads.length === 0`, the ternary selects: _"No results were found that meet the stated requirements."_

**Why the artefact "claims" 30**: The agent writes summary metadata (e.g., `verified_exact`, `delivered_count`) in fields or at a nesting level that Tower's extraction logic doesn't read. The agent's delivery summary log says "30 of 10 delivered" but this is the agent's own accounting, not what Tower sees in `payload_json`.

**Probability: ~60%**

---

#### Hypothesis 2: Empty `if` block at L1559 — confirmed latent defect (unlikely sole cause of this run's message)

**Code evidence:**

```typescript
// L1558–1560
if (deliveredCount >= requestedCount && requestedCount > 0) {
    if (hardViolations.length > 0) {
    } else if (hardUnknowns.length > 0) {
```

The block `if (hardViolations.length > 0) { }` at L1559 is **completely empty** — no return statement. When `deliveredCount >= requestedCount` AND hard constraints are violated, execution exits the outer `if` without returning, then falls to L1691 (`if (hardViolations.length > 0)`) which handles violations — all its internal paths do return.

**This is a confirmed code defect**: the count-met + hard-violated case has no dedicated handler. Execution falls through to logic designed for the count-NOT-met case, which uses messages that assume insufficient delivery. However, it does **not independently produce the observed message** unless `deliveredCount` is also 0. The L1691 block would return with rationale _"Only 30 exact matches were found..."_ if deliveredCount=30, not "No results were found."

This defect may cause incorrect rationale text in other runs where count is met but hard constraints are violated.

**Probability as sole cause of this run's message: ~5%. As a contributing defect worth fixing: high.**

---

#### Hypothesis 3: Evidence Quality Gate overrides ACCEPT → STOP, but the agent's error-reporting layer uses a generic message

**Code evidence:**

If somehow `deliveredCount = 30` and `requestedCount = 10` are correctly resolved, `judgeLeadsListCore()` returns ACCEPT (L1673). Then `judgeEvidenceQuality()` (L1033–1039) runs:

- If leads carry no `verified`/`evidence`/`source_url` fields AND `verified_exact_count` is null → gap `NO_EVIDENCE_PRESENT` → STOP
- The override at L1041–1050 produces rationale: `"The requested number... [Evidence quality: N lead(s) delivered but none carry verification data...]"`

This does NOT produce the exact message _"No results were found that meet the stated requirements."_ The message would contain the evidence quality annotation.

**Unless**: the calling agent (Supervisor) strips Tower's rationale and uses its own templated FAIL message, which defaults to the "No results found" text. This would be a Supervisor-side issue, not Tower-side.

**Probability: ~20%**

---

### Most Likely Explanation (Synthesis)

**The `final_delivery` artefact stored in the database has a `payload_json` that does not contain a `leads` array (or leads lack `name` fields) and does not contain `verification_summary.verified_exact_count`.** The agent's own delivery summary ("30 of 10 delivered") reflects the agent's internal accounting, but this data is stored in fields/locations that Tower's `judgeLeadsListArtefact()` extraction logic doesn't read.

Tower's `resolveDeliveredCount()` falls through all priority sources and returns `deliveredCount = 0`. With `requestedCount = 10` (or possibly also null), Tower enters either the INSUFFICIENT_COUNT path or the MISSING_REQUESTED_COUNT path, producing STOP with the generic "No results were found" message.

The empty `if` block at L1559 is a confirmed latent defect that would cause incorrect behavior when `deliveredCount >= requestedCount` AND hard constraints are violated, but it is likely not the primary trigger in this run since the message pattern suggests `deliveredCount === 0`.

---

## E) Minimal Fix Locations (No Patch)

| # | File | Line(s) | What to fix |
|---|---|---|---|
| 1 | `server/routes-judge-artefact.ts` | L160–162, L189–218 | **Payload extraction**: Add fallback resolution for `delivered_count`, `verified_exact`, and `requested` from top-level artefact fields and common agent payload shapes (e.g., `payloadJson.verified_exact`, `payloadJson.delivery_summary` parsed for count). |
| 2 | `server/routes-judge-artefact.ts` | L460–518 | **CVL merge**: When merging `verification_summary` from `lead_verification` artefact, also check for `verified_exact` at the root of the `final_delivery` payload_json itself (the agent may store it there instead of inside a nested `verification_summary` object). |
| 3 | `src/evaluator/towerVerdict.ts` | L1559 | **Empty if block**: Add explicit handling for the case where `deliveredCount >= requestedCount` but `hardViolations.length > 0`. This should either return STOP/CHANGE_PLAN with an appropriate message, or fall through intentionally with a comment. Currently it silently drops into subsequent logic designed for different conditions. |
| 4 | `src/evaluator/towerVerdict.ts` | L1909–1926 | **INTERNAL_ERROR fallback**: Add diagnostic logging that dumps the resolved `deliveredCount`, `requestedCount`, `leads.length`, `hardViolations.length`, and `hardUnknowns.length` to make it possible to diagnose which unexpected state combination was reached. |
| 5 | Agent-side (Supervisor/Wyshbone) | N/A | **Payload contract**: Ensure the `final_delivery` artefact's `payload_json` always includes: (a) `leads[]` with `name` field on each lead, (b) `verification_summary.verified_exact_count`, (c) `requested_count_user`. These are the three fields Tower depends on most for correct verdict computation. |
