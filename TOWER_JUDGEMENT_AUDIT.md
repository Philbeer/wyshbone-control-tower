# Tower Judgement System Audit

## 1. Plain-English Summary

Tower is the independent quality-assurance judge for Wyshbone. When the Supervisor completes a lead-generation run (or a factory-decision run), it sends a structured payload to Tower's `/tower-verdict` endpoint. Tower then decides whether the results are honest, complete, and verified.

**How it works today:**

1. **Contract Gate**: Tower first checks that the Supervisor actually sent delivery data (leads array, delivered count, etc.). If all delivery fields are missing, it returns `STOP` with `CONTRACT_ERROR`.

2. **No-Progress Gate**: If the attempt history shows the same radius and count across consecutive plan versions, Tower returns `STOP` with `NO_PROGRESS`.

3. **Concatenation Check**: Tower scans goal/title/summary text for corrupted inputs (merged words, repeated tokens). If detected, it returns `CHANGE_PLAN`.

4. **Per-Constraint Evaluation**: Tower iterates over each structured constraint and evaluates it against the delivered leads:
   - `NAME_CONTAINS` / `NAME_STARTS_WITH`: Regex or prefix match against lead names
   - `LOCATION`: Trusted from CVL results if present; otherwise auto-passed as unverifiable
   - `COUNT_MIN`: Simple numeric comparison
   - `HAS_ATTRIBUTE`: Looks up per-lead `attribute_evidence` artefacts from the database, optionally enriched by the Semantic Evidence Judge (LLM or keyword fallback)

5. **Core Verdict Decision**: Based on count satisfaction and constraint results:
   - If count met and no hard violations → `ACCEPT`
   - If count met but hard constraints violated → `STOP`
   - If count met but hard constraints unknown → `CHANGE_PLAN` (if replans available) or `STOP`
   - If count short → `CHANGE_PLAN` (with suggestions) or `STOP`

6. **Evidence Quality Gate**: After the core verdict, Tower runs `judgeEvidenceQuality` which checks whether leads marked `verified=true` actually carry evidence text or source URLs. Can downgrade `ACCEPT` → `STOP`.

7. **Relationship Predicate Gate**: If the goal contains relationship language ("works with", "supplies to"), Tower checks `verified_relationship_count`. Can downgrade `ACCEPT` → `STOP`.

8. **Unresolved Hard Constraint Gate**: If Supervisor reports unresolved hard constraints with verifiability metadata, Tower can downgrade to `STOP` or `ACCEPT_WITH_UNVERIFIED` (if `best_effort_accepted`).

9. **Time Predicate Gate**: If time predicates exist (e.g., "opened in last 6 months"), Tower checks satisfaction and proxy usage. Can downgrade `ACCEPT` → `STOP`.

10. **Truth Gate (Final)**: Even if everything else passes, Tower checks whether any hard constraint has `status === "unknown"` or `status === "not_attempted"`. If so, `ACCEPT` → `STOP` (or `ACCEPT_WITH_UNVERIFIED` if best-effort).

**The key insight**: Tower applies a **mostly uniform proof standard** to constraints. Hard constraints must have `passed === true` or the run is downgraded — either to `CHANGE_PLAN` (if replans are available) or `STOP`. There are selective exceptions: `LOCATION` constraints auto-pass when no CVL is present (with only a `LOCATION_NOT_VERIFIABLE` gap noted), and the `ACCEPT_WITH_UNVERIFIED` verdict exists for cases where hard constraints are unknown but best-effort or replan exhaustion applies. However, there is **no differentiation by constraint type** in the proof standard: a `NAME_STARTS_WITH` constraint (which Tower could trivially verify from the lead data itself) and a `HAS_ATTRIBUTE` constraint (which requires web scraping and semantic analysis) are both judged with the same `passed: boolean` gate in `judgeLeadsListCore`.

---

## 2. Exact Files and Functions Involved

| File | Key Functions | Role |
|------|--------------|------|
| `server/routes-tower-verdict.ts` | `router.post("/tower-verdict", ...)` | HTTP entry point; validates input, fetches attribute_evidence from DB, calls semantic enrichment, calls `judgeLeadsList` |
| `src/evaluator/towerVerdict.ts` | `judgeLeadsList()` | Outer verdict function — runs core + evidence quality + relationship + time + truth gates |
| `src/evaluator/towerVerdict.ts` | `judgeLeadsListCore()` | Core decision logic — resolves counts, evaluates constraints, determines base verdict |
| `src/evaluator/towerVerdict.ts` | `evaluateConstraint()` | Per-constraint evaluation (NAME_CONTAINS, LOCATION, HAS_ATTRIBUTE, etc.) |
| `src/evaluator/towerVerdict.ts` | `resolveConstraints()` | Normalizes constraints from multiple input formats |
| `src/evaluator/towerVerdict.ts` | `findAttributeEvidence()` | Matches per-lead evidence artefacts to constraints by name or place_id |
| `src/evaluator/evidenceQualityJudge.ts` | `judgeEvidenceQuality()` | Checks evidence presence/absence on leads; detects "verified without evidence" |
| `src/evaluator/semanticEvidenceJudge.ts` | `judgeEvidenceSemantically()` | LLM-based (or keyword fallback) judgement of whether evidence text supports a constraint |
| `src/evaluator/semanticEvidenceJudge.ts` | `enrichAttributeEvidence()` | Batch-enriches attribute evidence artefacts with semantic judgements |
| `src/evaluator/receiptTruthJudge.ts` | `judgeRunReceipt()` | Cross-checks receipt claims (contact counts) against actual artefacts |
| `src/evaluator/judgement.ts` | `evaluate()` | Operational mid-run judgement (cost/stall/target thresholds) — separate from Tower verdict |

---

## 3. Current Verdict Model and Data Structures

### Primary Verdict Type
```typescript
type TowerVerdictAction = "ACCEPT" | "ACCEPT_WITH_UNVERIFIED" | "CHANGE_PLAN" | "STOP";
```

### Verdict Output
```typescript
interface TowerVerdict {
  verdict: TowerVerdictAction;
  action: "continue" | "stop" | "change_plan";
  delivered: number;
  requested: number;
  gaps: string[];                          // e.g., ["HARD_CONSTRAINT_VIOLATED", "LABEL_MISLEADING"]
  confidence: number;                      // 0-100
  rationale: string;                       // human-readable explanation
  suggested_changes: SuggestedChange[];    // for CHANGE_PLAN
  constraint_results?: ConstraintResult[]; // per-constraint breakdown
  stop_reason?: StopReason;                // machine-readable failure code
  _debug?: TowerVerdictDebug;
}
```

### Constraint Types
```typescript
type ConstraintType = "NAME_CONTAINS" | "NAME_STARTS_WITH" | "LOCATION" | "COUNT_MIN" | "HAS_ATTRIBUTE";

interface Constraint {
  type: ConstraintType;
  field: string;
  value: string | number;
  hardness: "hard" | "soft";
}
```

### Constraint Result (per-constraint)
```typescript
interface ConstraintResult {
  constraint: Constraint;
  matched_count: number;
  total_leads: number;
  passed: boolean;                          // binary
  status?: CvlConstraintStatus;            // "yes" | "no" | "unknown" | "not_attempted" | "not_applicable"
  evidence_id?: string;
  source_url?: string;
  quote?: string;
  attribute_evidence_details?: Array<{ lead: string; evidence_id?: string; source_url?: string; quote?: string }>;
}
```

### Semantic Evidence Categories
```typescript
type SemanticStatus = "verified" | "weak_match" | "no_evidence" | "insufficient_evidence";
type SemanticStrength = "strong" | "indirect" | "weak" | "none";
type CvlConstraintStatus = "yes" | "no" | "unknown" | "not_attempted" | "not_applicable";
```

### Evidence Quality Gaps
Tower uses string-based gap codes, not an enum:
- `NO_EVIDENCE_PRESENT`
- `VERIFIED_WITHOUT_EVIDENCE`
- `VERIFIED_EXACT_BELOW_REQUESTED`
- `DELIVERY_SUMMARY_MISMATCH`
- `PASS_WITHOUT_VERIFICATION`

### Stop Reason Codes (not exhaustive — these are string literals, not an enum)
- `CONTRACT_ERROR`, `NO_PROGRESS`, `INPUT_CONCATENATED`
- `HARD_CONSTRAINT_VIOLATED`, `COUNT_MET_HARD_VIOLATED`
- `HARD_CONSTRAINT_UNKNOWN`, `HARD_CONSTRAINT_UNVERIFIABLE`
- `TRUTH_GATE_BLOCKED`, `TRUTH_GATE_BEST_EFFORT`
- `CONSTRAINT_GATE_BLOCKED`, `CONSTRAINT_GATE_BEST_EFFORT`
- `RELATIONSHIP_EVIDENCE_MISSING`, `RELATIONSHIP_VERIFICATION_NOT_ATTEMPTED`
- `TIME_PREDICATE_BLOCKED`, `MUST_BE_CERTAIN_VIOLATED`
- `INSUFFICIENT_COUNT`, `MAX_REPLANS_EXHAUSTED`, `ZERO_DELIVERED`

---

## 4. Diagnosis: Generic Proof Model vs. Claim-Sensitive Model

**Tower uses a mostly generic proof model.** Hard constraints must have `passed === true` or the run is downgraded. There are a few selective exceptions (LOCATION auto-passes, ACCEPT_WITH_UNVERIFIED for best-effort), but the core logic does not differentiate by constraint type.

### Evidence of the generic model:

**In `judgeLeadsListCore`** (~line 1641):
```typescript
const hardViolations = constraintResults.filter(
  (r) => !r.passed && r.constraint.hardness === "hard" && !hardUnknownKeys.has(...)
);
```

And the `hardUnknowns` array (constraints with `status === "unknown"` or `"not_attempted"`). These two arrays drive the entire verdict decision tree — if `hardViolations.length > 0` → STOP; if `hardUnknowns.length > 0` → CHANGE_PLAN or STOP.

**The Truth Gate** (line ~1397-1451) provides a final backstop:
```typescript
const hardUnverified = coreResult.constraint_results.filter((cr) => {
  if (cr.constraint.hardness !== "hard") return false;
  if (cr.passed) return false;
  const st = cr.status;
  if (st === "not_applicable") return false;
  return st === "unknown" || st === "not_attempted" || !cr.passed;
});
if (hardUnverified.length > 0) {
  // → STOP (or ACCEPT_WITH_UNVERIFIED if best_effort)
}
```

Neither the core decision logic nor the truth gate makes any distinction between constraint types. A `NAME_CONTAINS` constraint with `status=unknown` is treated identically to a `HAS_ATTRIBUTE` constraint with `status=unknown`. The one exception is `LOCATION`, which auto-passes when no CVL is present (with a non-blocking `LOCATION_NOT_VERIFIABLE` gap).

**The `evaluateConstraint` function** returns `passed: boolean` — a single binary flag per constraint. The richer `SemanticStatus` values (`verified`, `weak_match`, `no_evidence`, `insufficient_evidence`) are computed during semantic enrichment but are **not used in the verdict decision**. They are stored in the `AttributeEvidenceArtefact` but the truth gate only checks `cr.passed` and `cr.status`.

### What this means in practice:

- **A `NAME_CONTAINS` constraint** like "name must contain 'Thai'" checks `lead.name` with a regex. If matched → `passed=true`. If the CVL result says `unknown` → `passed=false`, even though Tower could trivially verify the name from the lead data.

- **A `HAS_ATTRIBUTE` constraint** like "must serve vegan food" requires web evidence, semantic analysis, and a judgement call. But the final gate applies the same `passed=true/false` binary.

- **The semantic layer** produces `weak_match` / `indirect` / `0.6 confidence` results that are effectively flattened: the `semantic_verdict` field on the `AttributeEvidenceArtefact` is either `"yes"` or something else, and `evaluateConstraint` treats `"yes"` as `passed=true`, everything else as `passed=false`.

---

## 5. Why B01 (Name-Match) Can Fail

A case like B01 — "find businesses starting with B in Manchester" — involves a `NAME_STARTS_WITH` constraint with `hardness: "hard"`.

**The failure path**:

1. `evaluateConstraint` for `NAME_STARTS_WITH` first checks for a CVL result:
   ```typescript
   case "NAME_STARTS_WITH": {
     if (cvlMatch) {
       return { passed: cvlMatch.status === "yes", ... };
     }
     // Only falls through to local check if no CVL match exists
     const matched = leads.filter((l) => l.name.toLowerCase().startsWith(prefix));
     return { passed: matched.length > 0, ... };
   }
   ```

2. If the Supervisor includes a `verification_summary.constraint_results` entry for this constraint with `status: "unknown"` (because it couldn't independently verify the name filter), Tower **uses the CVL status** (`unknown`) instead of doing its own local regex check. The local regex check only runs when there is **no** CVL result at all.

3. Back in `judgeLeadsListCore`, this constraint lands in the `hardUnknowns` array (not passed, not a hard violation — just unknown). Depending on whether replans are available:
   - If `canReplan(input)` → `CHANGE_PLAN` with `ADD_VERIFICATION_STEP` suggestion
   - If no replans remain → `STOP` with code `HARD_CONSTRAINT_UNKNOWN`
   
   The final Truth Gate (which runs after `judgeLeadsListCore`) provides a second check — if the core somehow produced `ACCEPT` despite an unknown hard constraint, it downgrades to `STOP`. But in practice, most B01-type failures are already caught in the core `hardUnknowns` path before reaching the truth gate.

**The root cause**: Tower trusts the Supervisor's CVL assertion over its own trivially-checkable data. For a name-match constraint, Tower has the leads and can verify the name itself, but the CVL `status=unknown` takes priority in the code path. The local check only runs as a fallback when CVL data is entirely absent.

---

## 6. Why B06 (Website-Evidence) Correctly Fails

A case like B06 — requiring a specific attribute verified via website scraping — fails because:

1. The Supervisor sends `attribute_evidence` artefacts with scraped web content.
2. Tower's route handler fetches any stored `attribute_evidence` artefacts from the DB for this run.
3. Tower runs `enrichAttributeEvidence` which calls the Semantic Evidence Judge on each artefact (LLM call, or keyword fallback if no API key).
4. The judge evaluates whether the scraped text actually supports the constraint and writes results back onto the evidence artefact (`semantic_verdict`, `semantic_status`, `semantic_strength`).
5. In `evaluateConstraint` for `HAS_ATTRIBUTE`, the `effectiveVerdict = ev.semantic_verdict ?? ev.verdict`:
   - If semantic says `"no"` → `hasNo = true` → `resolvedStatus = "no"` → `passed = false`. This is a hard violation → `STOP`.
   - If semantic says `"unknown"` (common with keyword fallback when token overlap is low) → `hasUnknown = true` → `resolvedStatus = "unknown"` → `passed = false`. This goes into the `hardUnknowns` path → `CHANGE_PLAN` if replans available, `STOP` otherwise.
6. The exact failure path depends on the combination of semantic results, count satisfaction, and replan availability — but in both the `"no"` and `"unknown"` semantic outcomes, the constraint does not pass.

**This is generally correct behavior**: the evidence was checked, the content didn't support the claim (or was inconclusive), and Tower properly rejected or requested replanning. The semantic layer is working as designed here.

---

## 7. Gap Analysis: What Would Need to Change

### Gap 1: Per-Constraint Verdicts

**Current state**: Tower produces a single `TowerVerdict` for the entire run. Individual constraint results are included in `constraint_results[]` but they only have `passed: boolean` and an optional `status: CvlConstraintStatus`.

**What's missing**:
- A formal per-constraint verdict type that captures the outcome with nuance (not just pass/fail)
- A per-constraint evidence-quality assessment
- A way to distinguish "constraint verified and passed" from "constraint could not be checked but is likely fine"

**What would need to change**:
- `ConstraintResult` needs a richer `verdict` field beyond `passed: boolean`
- The run verdict (`TowerVerdict`) should derive from the collection of per-constraint verdicts, not from counting `hardViolations` and `hardUnknowns`

### Gap 2: Claim-Sensitive Evidence Standards

**Current state**: All constraints go through the same binary gate. `NAME_CONTAINS("Thai")` and `HAS_ATTRIBUTE("vegan_food")` are both judged with the same `passed=true/false` standard.

**What's missing**:
- A notion of "proof burden" per constraint type — some constraints are self-evident from the data (name matching), others require external evidence (attributes), and others are fundamentally unverifiable from public data (relationships, time predicates)
- Different acceptance thresholds: a name match should accept on regex match alone; an attribute claim might accept on `weak_match` with high confidence; a relationship claim might require explicit evidence

**What would need to change**:
- A mapping from `ConstraintType` (and possibly claim sub-types) to a proof-burden level
- `evaluateConstraint` should not defer to CVL status when Tower can verify the constraint locally (e.g., name matching)
- The truth gate needs to apply different standards based on the proof burden

### Gap 3: Richer Outcomes Than Binary Pass/Fail

**Current state**: Tower has `SemanticStatus` values (`verified`, `weak_match`, `no_evidence`, `insufficient_evidence`) and `SemanticStrength` values (`strong`, `indirect`, `weak`, `none`), but these are only used during evidence enrichment. The final verdict path collapses them to `passed: boolean`.

**What's missing — a formal per-constraint outcome like**:
- `VERIFIED` — constraint is satisfied with strong evidence
- `PLAUSIBLE_BUT_UNVERIFIED` — evidence is indirect/weak but consistent
- `UNSUPPORTED` — no evidence found, cannot confirm
- `CONTRADICTED` — evidence actively contradicts the claim

**Current closest equivalents**:
| Desired Outcome | Current Mechanism | Where |
|----------------|-------------------|-------|
| VERIFIED | `semantic_status="verified"`, `semantic_strength="strong"`, `semantic_verdict="yes"` | `semanticEvidenceJudge.ts` (on evidence artefact only) |
| PLAUSIBLE_BUT_UNVERIFIED | `semantic_status="weak_match"`, `semantic_strength="indirect"` | `semanticEvidenceJudge.ts` (on evidence artefact only) |
| UNSUPPORTED | `semantic_status="no_evidence"`, `status="not_attempted"` | Various |
| CONTRADICTED | `semantic_verdict="no"`, `status="no"` | Various |

**The gap**: These statuses exist on the evidence enrichment layer but are **not surfaced in the per-constraint result or the final verdict**. The verdict path only sees `passed`/`!passed`.

**What would need to change**:
- `ConstraintResult` should carry a formal verdict enum (e.g., `VERIFIED | PLAUSIBLE | UNSUPPORTED | CONTRADICTED`)
- The verdict logic in `judgeLeadsListCore` should use these categories to make nuanced decisions
- The truth gate should treat `PLAUSIBLE` differently from `UNSUPPORTED` for different constraint types

---

## 8. Recommendation: Minimum Clean Changes

### Change 1: Per-Constraint Verdict Enum

Add a formal constraint-level verdict to `towerVerdict.ts`:

```typescript
type ConstraintVerdict = "VERIFIED" | "PLAUSIBLE" | "UNSUPPORTED" | "CONTRADICTED" | "NOT_APPLICABLE";
```

Add it to `ConstraintResult`:
```typescript
interface ConstraintResult {
  constraint: Constraint;
  constraint_verdict: ConstraintVerdict;  // NEW
  // ... existing fields
}
```

Map the existing semantic statuses → constraint verdict in `evaluateConstraint`. For name/location constraints that Tower can check locally, set `VERIFIED` directly without relying on CVL status.

### Change 2: Proof Burden by Constraint Type

Add a proof-burden classification:

```typescript
type ProofBurden = "self_evident" | "evidence_required" | "inherently_uncertain";
```

Map constraint types to proof burdens:
- `NAME_CONTAINS`, `NAME_STARTS_WITH`, `COUNT_MIN` → `self_evident` (Tower can verify from the data itself)
- `HAS_ATTRIBUTE`, `LOCATION` → `evidence_required` (needs external verification)
- Relationship predicates, time predicates → `inherently_uncertain` (may never be fully verifiable)

In `evaluateConstraint`, for `self_evident` constraints, **always do the local check** and don't defer to CVL `unknown` status. Only use CVL for `evidence_required` constraints.

### Change 3: Derive Run Verdict from Constraint Verdicts

Replace the current `hardViolations` / `hardUnknowns` counting approach with a rule-based derivation:

1. For each hard constraint, look at its `ConstraintVerdict`:
   - `VERIFIED` → passes
   - `PLAUSIBLE` → passes for `self_evident` proof burden; needs review for `evidence_required`
   - `UNSUPPORTED` → fails for `self_evident`; `CHANGE_PLAN` for `evidence_required` if replans available
   - `CONTRADICTED` → always fails

2. Run verdict:
   - All hard constraints `VERIFIED` → `ACCEPT`
   - Some hard constraints `PLAUSIBLE` (none worse) → `ACCEPT_WITH_UNVERIFIED`
   - Any hard constraint `UNSUPPORTED` + replans → `CHANGE_PLAN`
   - Any hard constraint `CONTRADICTED` → `STOP`
   - Any hard constraint `UNSUPPORTED` + no replans → `STOP`

### Files That Would Change

| File | Change |
|------|--------|
| `src/evaluator/towerVerdict.ts` | Add `ConstraintVerdict` type, `ProofBurden` type, modify `evaluateConstraint` to return `constraint_verdict`, modify `judgeLeadsListCore` truth-gate logic |
| `src/evaluator/semanticEvidenceJudge.ts` | No changes needed — it already produces `SemanticStatus` and `SemanticStrength` which map cleanly to `ConstraintVerdict` |
| `src/evaluator/evidenceQualityJudge.ts` | No changes needed — it operates on lead-level evidence, not constraint verdicts |
| `server/routes-tower-verdict.ts` | No changes needed — it passes through to `judgeLeadsList` |

### What This Fixes

- **B01 (name match)**: `NAME_STARTS_WITH` is `self_evident`. Tower does its own regex check regardless of CVL status. If leads match the name filter → `VERIFIED` → passes. No longer blocked by a CVL `unknown`.
- **B06 (website attribute)**: `HAS_ATTRIBUTE` is `evidence_required`. Semantic judge returns `no_evidence` → `UNSUPPORTED` → fails. Behavior unchanged, but now explicitly modeled.
- **Mixed cases**: A run with 3 verified name-match leads but an unverified "outdoor seating" attribute would get `ACCEPT_WITH_UNVERIFIED` instead of `STOP` — the name constraints are `VERIFIED` (self-evident), the attribute is `PLAUSIBLE` (weak match), and the overall verdict reflects the mixed state.

### Estimated Scope

- ~150-200 lines changed in `towerVerdict.ts`
- 0 new files needed
- 0 changes to the HTTP API contract (the response shape stays the same, just richer `constraint_results`)
- Backward-compatible: `passed: boolean` can remain alongside `constraint_verdict` during transition

---

## Phase 6: Bug Fixes — COUNT_MIN Search Pool & Self-Evident Evidence Quality

Two bugs identified and fixed:

### Bug Fix 1: COUNT_MIN Search Pool (TOWER_COUNT_FIX)

**Problem:** `resolveDeliveredCount()` priority chain ranked `leads.length` above `delivered_count`. When Supervisor passed the full SEARCH_PLACES pool (e.g. 20 results) as `leads` but set `delivered_count` to the filtered amount (e.g. 1 after FILTER_FIELDS), COUNT_MIN was incorrectly evaluated against 20 instead of 1.

**Fix:** Moved `delivered_count` above `leads.length` in the priority chain. When Supervisor explicitly provides `delivered_count`, it is the authoritative delivery signal and should not be overridden by the size of the leads array (which may be the search pool). `delivered_leads.length` remains the highest priority since it's explicitly the delivered set.

**Priority chain (after fix):**
1. `delivered_leads.length` (explicit delivered set)
2. `delivered_count` (explicit delivery signal — **moved up**)
3. `leads.length` (may be search pool)
4. `verification_summary.verified_exact_count`
5. `verified_exact`
6. `accumulated_count`
7. `delivered.delivered_matching_accumulated`
8. `delivered.delivered_matching_this_plan`
9. `delivered` (number)
10. `matchedLeadCount`
11. 0 (default)

### Bug Fix 2: Self-Evident Evidence Quality Override (TOWER_SELF_EVIDENT_FIX)

**Problem:** The evidence quality judge (`judgeEvidenceQuality`) applied `NO_EVIDENCE_PRESENT` and `VERIFIED_EXACT_BELOW_REQUESTED` checks to all queries, including ones where the only hard constraints were self-evident types (NAME_CONTAINS, NAME_STARTS_WITH). For "Find pubs in Arundel with Swan in the name", Tower correctly verified the name constraint via local string matching (`constraint_verdict: VERIFIED`), then the evidence quality gate overrode ACCEPT → STOP because leads didn't carry `verified: true` or `evidence` fields.

**Fix:** Added `allHardConstraintsSelfEvident()` check before the evidence quality override. Self-evident constraint types: NAME_CONTAINS, NAME_STARTS_WITH, LOCATION, COUNT_MIN. When all hard constraints are self-evident, the evidence quality judge's ACCEPT → STOP override is bypassed. Non-self-evident constraints (HAS_ATTRIBUTE with `evidence_requirement: "web"`) still trigger the evidence quality gate normally.

**Files changed:** `src/evaluator/towerVerdict.ts`
**Test result:** 144 passed / 7 failed (no regressions — same 7 pre-existing failures)
