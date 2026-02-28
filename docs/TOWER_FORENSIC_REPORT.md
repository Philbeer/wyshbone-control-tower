# Wyshbone Tower Forensic Report

**Scope**: Does Tower influence (1) clarify-for-run behaviour, (2) delivery summary PASS/FAIL wording, (3) relationship predicate verification, and (4) labeling such as 'match' vs 'unverified'?

**Date**: 2026-02-28

---

## A) Does Tower Run During Clarify Mode?

### Answer: No. Tower does not run during any clarify mode.

**Evidence**:

- There is no function, variable, or string literal named `clarify_for_run`, `clarifyForRun`, or `clarify_mode` anywhere in the codebase.
- The word "clarify" appears in only two places in evaluator code:
  1. `src/evaluator/conversationQualityAnalysis.ts` (line 15) — as `missing_clarification_logic`, which is a **post-hoc failure category** used by the Conversation Quality Analyser. It flags conversations where the assistant *should have* asked a clarifying question but didn't. This runs *after* a conversation has already happened, not during a live clarify flow.
  2. `src/evaluator/autoConversationQualityAnalysis.ts` (line 17) — inside a prompt string instructing the LLM evaluator: *"Do NOT start searching without clarifying location/market."* This is guidance text for grading conversations, not execution logic.
- No server routes (`server/`) contain the word "clarify" at all.
- `config/tasks.json` references task UI-002 ("Ask clarifying questions before running tools") as a requirement for the Wyshbone UI agent, but this is a task definition — Tower does not enforce or participate in that flow.

**Conclusion**: Tower is purely a post-execution judge. It evaluates results *after* a run has produced leads. It has no hook into, and no awareness of, any pre-run clarification step.

---

## B) Delivery Summary Truth Alignment

### B1. Where Tower Decides PASS/FAIL

Tower does **not** issue its own "PASS" or "FAIL" label. Its verdict vocabulary is:

| Verdict | Meaning |
|---|---|
| `ACCEPT` | Results meet requirements, continue |
| `CHANGE_PLAN` | Results insufficient, replan |
| `STOP` | Results insufficient and no further replanning possible |

These are defined in `src/evaluator/towerVerdict.ts`, line 3:
```
export type TowerVerdictAction = "ACCEPT" | "CHANGE_PLAN" | "STOP";
```

The word "PASS" enters Tower as an **input**, not an output. The `TowerVerdictInput` interface (line 178) accepts:
```
delivery_summary?: "PASS" | "PARTIAL" | "STOP" | string;
```
This is a label supplied by the Wyshbone Supervisor (the upstream caller) when it sends data to Tower for judgement.

### B2. What Inputs Tower Uses

The `judgeLeadsList` function (line 849) is the main entry point. It makes its verdict based on:

1. **Requested count** — resolved via `resolveRequestedCount()` (line 201), which checks `requested_count_user`, `success_criteria.requested_count_user`, `success_criteria.target_count`, and `requested_count`, in that priority order.
2. **Delivered count** — resolved via `resolveDeliveredCount()` (line 226). This function **prioritises CVL verified_exact_count** (line 227-229) when available. If no CVL data exists, it falls back to `delivered_matching_accumulated`, then to `matchedLeadCount` (a name-regex match count), then to raw `delivered` numbers.
3. **Constraint satisfaction** — hard constraints must pass; soft constraints can be relaxed.
4. **Evidence quality** — via `judgeEvidenceQuality()` in `src/evaluator/evidenceQualityJudge.ts` (line 46).

### B3. Where a Misleading PASS Could Happen

**Risk 1: Supervisor sends `delivery_summary: "PASS"` but Tower says `STOP`.**

This is detected. `judgeEvidenceQuality()` (line 83-88 of `evidenceQualityJudge.ts`) explicitly checks for this contradiction:

```
if (delivery_summary === "PASS" && tower_verdict === "STOP") {
    gaps.push("DELIVERY_SUMMARY_MISMATCH");
}
```

This produces a blocking gap that forces the overall evidence quality verdict to `STOP`. So Tower *does* catch the case where Supervisor claims PASS but Tower disagrees.

**Risk 2: Lead count inflation — raw lead count used instead of verified count.**

The function `resolveDeliveredCount()` (line 226) guards against this: when CVL (Control Verification Layer) data is present, it uses `verified_exact_count` and ignores the raw lead count. However, when CVL data is *absent* (`hasCvl()` returns false), it falls back to `matchedLeadCount` from `getMatchedLeadCount()` (line 535). This function counts leads whose *names* match name constraints via regex. **It does not verify the leads are real businesses or meet the user's actual intent.** A name match is not evidence of quality.

**Risk 3: `ACCEPT` issued with zero evidence when no CVL and no evidence fields exist.**

In `judgeLeadsList()` (line 864), the evidence quality check is only triggered when `hasAnyEvidenceField` is true (at least one lead has `verified`, `evidence`, or `source_url` set) OR when `delivery_summary` is provided. If *neither* condition is true, the evidence quality judge is **skipped entirely**, and the core verdict (which is purely count-based) stands unchallenged.

**Risk 4: `delivery_summary` is not validated against Tower's own verdict by default.**

The `DELIVERY_SUMMARY_MISMATCH` gap (Risk 1) only fires inside `judgeEvidenceQuality`, which itself only fires conditionally (Risk 3). If the Supervisor sends `delivery_summary: "PASS"` but no evidence fields and no leads with `verified`/`evidence`/`source_url`, the mismatch check never runs.

---

## C) Relationship Predicates

### C1. Rubric/Rule for Relationship Claims

Tower has a dedicated **Relationship Predicate Gate** in `src/evaluator/towerVerdict.ts`.

**Detection**: `detectRelationshipPredicate()` (line 836) scans the user's original goal text against the `RELATIONSHIP_PREDICATE_PATTERNS` array (lines 819-834). Recognised predicates include:

| Pattern | Label |
|---|---|
| `works with` / `working with` | "works with" |
| `supplies` / `supply` / `supplying` | "supplies" |
| `serves` / `serving` (excluding food context) | "serves" |
| `supports` / `supporting` (excluding tech context) | "supports" |
| `partners with` / `partnering with` | "partners with" |
| `provides services to` / `providing services to` | "provides services to" |
| `contracted by/to` | "contracted by/to" |

**Enforcement**: In `judgeLeadsList()` (lines 905-947), after the core verdict and evidence quality checks:

1. Tower determines `requiresRelEvidence` — true if either `input.requires_relationship_evidence === true` (explicit from Supervisor) OR `detectRelationshipPredicate()` auto-detects a predicate in the goal.
2. It reads `verified_relationship_count` from the input (default 0).
3. If relationship evidence is required AND `verified_relationship_count === 0` AND the core verdict was `ACCEPT`, Tower **overrides to `STOP`**.

The stop code depends on whether any leads were delivered at all:
- `RELATIONSHIP_EVIDENCE_MISSING` — leads found, but none have verified relationship evidence.
- `RELATIONSHIP_UNVERIFIED` — no leads with confirmed relationship evidence at all.

### C2. How Tower Labels Results When Evidence Is Missing

Tower uses three CVL status values throughout (`CvlConstraintStatus`, line 97):

| Status | Meaning |
|---|---|
| `"yes"` | Constraint verified with evidence |
| `"no"` | Constraint checked and failed |
| `"unknown"` | Constraint not checked, or check was inconclusive |

When evidence is missing for a HAS_ATTRIBUTE constraint, the status is set to `"unknown"` (line 403, line 434). This is also the fallback when no CVL match and no attribute evidence exist.

For relationship predicates specifically, the stop codes `RELATIONSHIP_EVIDENCE_MISSING` and `RELATIONSHIP_UNVERIFIED` are used (lines 916-917).

### C3. Whether 'unverified' Could Be Misread

**Yes, there is ambiguity.**

The status `"unknown"` (used throughout `towerVerdict.ts`) means "we did not check" or "the check was inconclusive." But the stop code `RELATIONSHIP_UNVERIFIED` (line 917) uses the word "unverified," and its message says: *"Required relationship could not be verified. No results with confirmed relationship evidence."*

The distinction between "we couldn't verify it" and "we didn't try to verify it" is not made explicit in the output. A downstream consumer reading `RELATIONSHIP_UNVERIFIED` could reasonably interpret it as "Tower checked and found no relationship" when in reality it might mean "nobody attempted verification."

Similarly, `CvlConstraintStatus = "unknown"` is technically accurate but could be misread as "pending" rather than "absent." There is no separate status for "verification was attempted but failed" vs "verification was never attempted."

The `checkLabelHonesty()` function (line 582) only checks whether the artefact title/summary mentions a relaxed constraint's keywords — it does not check whether relationship-related labels accurately reflect verification status.

---

## D) Minimal Fix Targets

If changes are needed, the smallest set of files and what each must enforce:

### Fix 1: Prevent ACCEPT without evidence quality check
**File**: `src/evaluator/towerVerdict.ts`
**Function**: `judgeLeadsList()` (line 864)
**What to enforce**: Always run `judgeEvidenceQuality()`, even when no evidence fields exist on leads and no `delivery_summary` is provided. When evidence fields are completely absent, the evidence quality judge should flag this as a gap (e.g., `NO_EVIDENCE_PRESENT`) rather than silently passing.

### Fix 2: Make DELIVERY_SUMMARY_MISMATCH unconditional
**File**: `src/evaluator/towerVerdict.ts`
**Function**: `judgeLeadsList()` (line 864 conditional block)
**What to enforce**: Check `delivery_summary` against the core verdict *before* the conditional that gates the evidence quality check. If `delivery_summary === "PASS"` and core verdict is `STOP`, flag the mismatch regardless of whether evidence fields exist.

### Fix 3: Disambiguate "unknown" from "not attempted"
**File**: `src/evaluator/towerVerdict.ts`
**Type**: `CvlConstraintStatus` (line 97)
**What to enforce**: Add a fourth status value (e.g., `"not_attempted"`) to distinguish "verification was run but inconclusive" from "verification was never run." Update `evaluateConstraint()` (line 323) to use `"not_attempted"` when no CVL data and no attribute evidence exist, instead of `"unknown"`.

### Fix 4: Rename RELATIONSHIP_UNVERIFIED or add detail
**File**: `src/evaluator/towerVerdict.ts`
**Lines**: 915-917
**What to enforce**: Either rename the stop code to `RELATIONSHIP_NOT_CHECKED` when `verified_relationship_count` is 0 because no verification was attempted, or add a `verification_attempted: boolean` field to the stop reason evidence object so downstream consumers can distinguish the two cases.

### Fix 5: Ban 'match' language without evidence
**File**: `src/evaluator/towerVerdict.ts`
**Function**: `checkLabelHonesty()` (line 582)
**What to enforce**: Expand the honesty check to flag artefact titles/summaries that use the word "match" or "matched" when the actual constraint status is `"unknown"` or `"not_attempted"`. Currently, `checkLabelHonesty` only checks for relaxed constraint keywords in the title — it should also check that "match" claims are backed by `status: "yes"` evidence.

### Summary Table

| Priority | File | Function/Line | Fix |
|---|---|---|---|
| High | `src/evaluator/towerVerdict.ts` | `judgeLeadsList()` L864 | Always run evidence quality check |
| High | `src/evaluator/towerVerdict.ts` | `judgeLeadsList()` L864 | Unconditional delivery_summary mismatch check |
| Medium | `src/evaluator/towerVerdict.ts` | `CvlConstraintStatus` L97 | Add `"not_attempted"` status |
| Medium | `src/evaluator/towerVerdict.ts` | L915-917 | Disambiguate RELATIONSHIP_UNVERIFIED |
| Medium | `src/evaluator/towerVerdict.ts` | `checkLabelHonesty()` L582 | Ban "match" without evidence |

All five fixes target a single file: `src/evaluator/towerVerdict.ts`. The evidence quality judge (`src/evaluator/evidenceQualityJudge.ts`) does not need changes — it correctly flags problems when called; the issue is that it is not always called.

### Additional Note: Schema Validation Gap

In `server/routes-tower-verdict.ts` (line 182), `delivery_summary` is validated as `z.string().optional()` — it accepts any arbitrary string, not just `"PASS" | "PARTIAL" | "STOP"`. This means a caller could send a typo or unexpected value (e.g., `"pass"` lowercase, or `"SUCCESS"`) and the `DELIVERY_SUMMARY_MISMATCH` check in `evidenceQualityJudge.ts` (which checks `delivery_summary === "PASS"` with strict equality) would silently miss it. If the route schema were tightened to `z.enum(["PASS", "PARTIAL", "STOP"])`, invalid values would be rejected at the API boundary.
