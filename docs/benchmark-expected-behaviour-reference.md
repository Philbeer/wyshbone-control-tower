# Benchmark Expected Behaviour Reference

**Generated:** March 11, 2026  
**Purpose:** Calibration reference for the 12-test benchmark suite. Documents the current expected behaviour of the full Tower + Behaviour Judge pipeline end-to-end.

---

## 1. Tower Verdicts

There are exactly **4** Tower verdicts. Defined in `src/evaluator/towerVerdict.ts`.

| Verdict | UI Label | What It Means |
|---|---|---|
| `ACCEPT` | Verified satisfied | All hard constraints passed, count met, evidence quality good. Run is a success. |
| `ACCEPT_WITH_UNVERIFIED` | Ran, but not verified — best-effort accepted | Hard constraints could not be fully verified, but `best_effort_accepted=true` was set (replans exhausted or Supervisor explicitly accepted uncertainty). Results are delivered with a caveat. |
| `CHANGE_PLAN` | Replanning | Results are insufficient or unverified, replans are still available. Tower recommends a new strategy (e.g. wider radius, relaxed constraint, additional verification step). |
| `STOP` | Cannot meet requirements honestly | Run failed decisively. Caused by hard constraint violations, contradictory evidence, relationship verification missing, evidence quality failure, fictional/impossible location, time predicate unresolvable, or replans exhausted with no progress. |

### How ACCEPT_WITH_UNVERIFIED differs from ACCEPT

`ACCEPT_WITH_UNVERIFIED` is only issued when Tower would otherwise issue `STOP` due to unresolved hard constraints, but the Supervisor has flagged `best_effort_accepted=true`. The `action` field is `"continue"` (same as ACCEPT), so the run is not blocked — but the gap code `CONSTRAINT_GATE_BEST_EFFORT` is recorded.

### Key internal mechanisms behind Tower verdicts

Tower applies a cascade of gates in order:

1. **Contract Gate** — delivery data must be present; otherwise `STOP / CONTRACT_ERROR`
2. **No-Progress Gate** — same radius + count across plan versions → `STOP / NO_PROGRESS`
3. **Concatenation Check** — corrupted text input → `CHANGE_PLAN`
4. **Per-Constraint Evaluation** — each constraint is assessed against delivered leads and evidence
5. **Core Verdict** — count met + no hard violations → `ACCEPT`; count short or violations → `CHANGE_PLAN` / `STOP`
6. **Evidence Quality Gate** — can downgrade `ACCEPT → STOP` if leads lack real evidence (bypassed for discovery-only and self-evident constraints)
7. **Relationship Predicate Gate** — if goal contains relationship language and `verified_relationship_count=0` → `ACCEPT → STOP`
8. **Unresolved Hard Constraint Gate** — Supervisor-reported unresolvable constraints → `STOP` or `ACCEPT_WITH_UNVERIFIED`
9. **Time Predicate Gate** — unverifiable temporal constraints → `STOP`
10. **Truth Gate (final)** — any hard constraint still `unknown` or `not_attempted` → `STOP` (or `ACCEPT_WITH_UNVERIFIED` if best-effort)

### Per-constraint verdicts (internal, not Tower verdicts)

These are assigned to individual constraints before the overall Tower verdict is determined:

| Status | Meaning |
|---|---|
| `VERIFIED` | Passed with strong evidence (first-party website if required, or self-evident) |
| `PLAUSIBLE` | Passed but evidence is not first-party (e.g. directory or snippet when website_text was required) |
| `UNSUPPORTED` | No positive evidence found |
| `CONTRADICTED` | Evidence actively contradicts the constraint |
| `NOT_APPLICABLE` | Constraint does not apply to this run |

---

## 2. Behaviour Judge Outcomes

There are exactly **5** Behaviour Judge outcomes. Defined in `src/evaluator/behaviourJudge.ts`. Assigned by an LLM (GPT-4o by default) retrospectively after the run completes.

| Outcome | What It Means |
|---|---|
| `PASS` | Agent met the request. Correct routing decision, sound queries, constraints satisfied or plausibly met, evidence handled properly. No action needed. |
| `HONEST_PARTIAL` | Agent performed well — correct approach, proper verification — but the real world genuinely lacks enough matching results. Shortfall is scarcity, not error. Example: asked for 10 vegan restaurants in a small village; only 3 exist anywhere. |
| `BATCH_EXHAUSTED` | Agent's technique was sound within the batch it searched, but the search window was too narrow (radius, keywords, page depth). More matching results likely exist and a wider search would find them. Example: searched 5km radius when 15km would have found more. |
| `CAPABILITY_FAIL` | Agent missed findable results. Causes: bad search queries, missed obvious evidence on pages it visited, wrong constraint interpretation, failed to filter correctly, or did not visit websites when website evidence was required. |
| `WRONG_DECISION` | Agent made the wrong routing decision. Either ran a search when it should have asked for clarification first (ambiguous goal, missing location, fictional place), or asked for clarification when the goal was clear enough to act on. |

### Key distinctions

**HONEST_PARTIAL vs BATCH_EXHAUSTED:** Both involve a shortfall with a competent agent. The question is: *would a broader search plausibly find more?* If yes → `BATCH_EXHAUSTED`. If the world genuinely doesn't have more → `HONEST_PARTIAL`.

**BATCH_EXHAUSTED vs CAPABILITY_FAIL:** Was the agent's *technique* correct within what it searched? If yes but scope was too small → `BATCH_EXHAUSTED`. If the technique itself was wrong (bad queries, missed evidence on pages it did visit) → `CAPABILITY_FAIL`.

**CAPABILITY_FAIL vs WRONG_DECISION:** Did the agent make the right decision to run? If yes but executed poorly → `CAPABILITY_FAIL`. If it should not have run at all (or vice versa) → `WRONG_DECISION`.

---

## 3. Query Classes

The system recognises **5** query classes (inferred automatically in `inferQueryClass()`):

| Class | Detection Rule | Description |
|---|---|---|
| `simple_discovery` | Default (no other pattern matches) | Find businesses by category + location |
| `name_match` | Any `NAME_CONTAINS` or `NAME_STARTS_WITH` constraint | Find businesses with a specific name pattern |
| `website_evidence` | Constraint has `evidence_requirement=website_text`, or `HAS_ATTRIBUTE` with website/page field, or goal contains "website" + "mention/evidence/says" | Find businesses whose website explicitly mentions something |
| `relationship` | Goal contains "work with", "partner", "supplier", "relationship", or `HAS_ATTRIBUTE` with those values | Find organisations with a verified relationship to another entity |
| `clarify_required` | Goal or location matches a fictional location pattern (Narnia, Hogwarts, Gotham, Wakanda, Middle Earth, Westeros, etc.) | Goal cannot be acted on without clarification |

**Note:** Vague/ambiguous queries (e.g. "find amazing vibes in London") and missing-location queries (e.g. "find breweries" with no location) are not their own query class in code. They are classified as `simple_discovery` by `inferQueryClass()`, but the agent is expected to route them to a clarifying question *before* a run is ever submitted. If the agent runs instead of asking, the Behaviour Judge assigns `WRONG_DECISION`.

---

## 4. Expected System Behaviour by Query Type

### 4.1 Clear Discoverable Query
**Example:** *Find pubs in Arundel with "Swan" in the name*

- **Query class:** `name_match`
- **Constraints:** `LOCATION` (hard), `NAME_CONTAINS` (hard), `COUNT_MIN` (hard)
- **Evidence requirement:** Self-evident — Tower verifies `NAME_CONTAINS` directly from lead names; no website visit needed
- **Evidence Quality Gate:** Bypassed (all hard constraints are self-evident types)
- **Agent must:** Search for pubs in Arundel, filter to those with "Swan" in name, deliver results
- **Tower behaviour:** Evaluates name constraint via regex match on lead names. Self-evident bypass means evidence quality gate does not downgrade verdict.
- **Perfect run verdict:** `ACCEPT`
- **Perfect run outcome:** `PASS`

---

### 4.2 Discovery-Only Query
**Example:** *Find 10 cafes in York*

- **Query class:** `simple_discovery`
- **Strategy flag:** `discovery_only` + `verification_policy=DIRECTORY_VERIFIED`
- **Constraints:** `LOCATION` (hard), `COUNT_MIN` (hard)
- **Evidence requirement:** Directory-level data only; no website fetching required
- **Evidence Quality Gate:** Explicitly bypassed when `strategy=discovery_only` AND `verification_policy=DIRECTORY_VERIFIED`
- **Agent must:** Search for cafes in York, return at least 10 leads from directory/map sources
- **Tower behaviour:** Accepts directory data as sufficient proof. Does not require `verified=true` on leads.
- **Perfect run verdict:** `ACCEPT`
- **Perfect run outcome:** `PASS`

---

### 4.3 Website Evidence Query
**Example:** *Find restaurants in Bath with vegan options*

- **Query class:** `website_evidence`
- **Constraints:** `LOCATION` (hard), `HAS_ATTRIBUTE` with `evidence_requirement=website_text` (hard), `COUNT_MIN` (hard)
- **Evidence requirement:** `first_party_website` — agent must visit each restaurant's own website to confirm vegan options
- **Evidence Quality Gate:** Active. If leads are marked verified but lack real evidence text or source URLs, Tower downgrades `ACCEPT → STOP`
- **Agent must:** Find restaurants in Bath, visit each candidate's website, confirm vegan language on their page, deliver only confirmed leads
- **Tower behaviour:** `HAS_ATTRIBUTE` constraint requires `source_tier=first_party_website` for `VERIFIED` status. Snippet-only evidence yields `PLAUSIBLE` at best — insufficient for a hard constraint needing `website_text`
- **Behaviour Judge note:** If agent only checked search snippets without visiting websites → `CAPABILITY_FAIL`
- **Perfect run verdict:** `ACCEPT` (with `VERIFIED` constraint verdicts and first-party source evidence)
- **Perfect run outcome:** `PASS`

---

### 4.4 Vague / Ambiguous Query
**Example:** *Find amazing vibes in London*

- **Query class inferred:** `simple_discovery` (the vagueness is not a separate class)
- **What makes it vague:** No concrete business type, no verifiable attribute — "amazing vibes" cannot be evaluated as a constraint
- **Expected agent behaviour:** Ask a clarifying question before running any search. The agent should identify that the constraint is not actionable without further input (what type of venue? what makes "amazing vibes"?).
- **Tower behaviour:** If a run is submitted for this goal, Tower has no concrete constraints to enforce and the goal cannot be satisfied honestly. Likely `STOP` due to unresolvable constraints or `CHANGE_PLAN` requesting clarification.
- **Behaviour Judge:** If agent ran a search → `WRONG_DECISION`. If agent asked for clarification → `PASS`.
- **Perfect run verdict:** No Tower verdict issued (agent asks for clarification before running)
- **Perfect run outcome:** `PASS`

---

### 4.5 Impossible / Fictional Query
**Example:** *Find pubs in Narnia*

- **Query class:** `clarify_required` (Narnia matches `FICTIONAL_LOCATION_PATTERNS`)
- **Expected agent behaviour:** Must ask a clarifying question. The location is fictional; running a search would be a routing error.
- **Tower behaviour:** If a run is somehow submitted, Tower detects the fictional location (or receives zero deliverable leads matching a fictional location constraint) and issues `STOP`. Stop reason codes for this scenario: `HARD_CONSTRAINT_VIOLATED` or `ZERO_DELIVERED`.
- **Behaviour Judge:** If agent ran without clarifying → `WRONG_DECISION`. If agent asked "did you mean a real location?" → `PASS`.
- **Perfect run verdict:** No Tower verdict issued (agent asks for clarification before running)
- **Perfect run outcome:** `PASS`

---

### 4.6 Clarification-Required Query
**Example:** *Find breweries* (no location specified)

- **Query class inferred:** `simple_discovery` (missing location is not a separate class)
- **What makes it clarification-required:** A `LOCATION` constraint is required but the goal provides no location. Without it, the search has no geographic scope.
- **Expected agent behaviour:** Ask for a location before running. Do not guess or assume a default location.
- **Tower behaviour:** If a run is submitted without a location constraint, Tower cannot verify locality. A `LOCATION` constraint set to an assumed value that was never stated by the user would be a fabrication. Run would likely fail the truth gate.
- **Behaviour Judge:** If agent ran without a location → `WRONG_DECISION`. If agent asked for location → `PASS`.
- **Perfect run verdict:** No Tower verdict issued (agent asks for clarification before running)
- **Perfect run outcome:** `PASS`

---

### 4.7 Relationship Query
**Example:** *Find organisations working with the local authority*

- **Query class:** `relationship`
- **Constraints:** `LOCATION` (hard), `HAS_ATTRIBUTE` with relationship evidence requirement (hard)
- **Evidence requirement:** Concrete, verifiable relationship evidence — a partner list on the organisation's website, a council supplier register, or equivalent first-party source. Co-mentions alone are insufficient.
- **Relationship Predicate Gate:** Tower auto-detects relationship language ("working with", "works with", "partner", "supplier", etc.) in the goal. If `verified_relationship_count=0` when the core verdict would be `ACCEPT`, Tower downgrades to `STOP / RELATIONSHIP_EVIDENCE_MISSING`.
- **Agent must:** Find candidates, then visit their websites (or the local authority's website) to find explicit evidence of the working relationship. Deliver only leads with confirmed relationship evidence.
- **Behaviour Judge note:** Snippet-level co-mentions without visiting websites → `CAPABILITY_FAIL`
- **Perfect run verdict:** `ACCEPT` (requires `verified_relationship_count > 0` and first-party evidence)
- **Perfect run outcome:** `PASS`

---

## 5. Perfect-Run Summary Table

| # | Query Type | Example | Query Class | Tower Verdict | Behaviour Judge |
|---|---|---|---|---|---|
| 1 | Clear discoverable | Pubs in Arundel with Swan in name | `name_match` | `ACCEPT` | `PASS` |
| 2 | Discovery-only | Find 10 cafes in York | `simple_discovery` | `ACCEPT` | `PASS` |
| 3 | Website evidence | Restaurants in Bath with vegan options | `website_evidence` | `ACCEPT` | `PASS` |
| 4 | Vague / ambiguous | Find amazing vibes in London | `simple_discovery` | *(none — agent asks first)* | `PASS` |
| 5 | Impossible / fictional | Find pubs in Narnia | `clarify_required` | *(none — agent asks first)* | `PASS` |
| 6 | Clarification-required | Find breweries (no location) | `simple_discovery` | *(none — agent asks first)* | `PASS` |
| 7 | Relationship | Organisations working with local authority | `relationship` | `ACCEPT` | `PASS` |

**Note on rows 4–6:** For a *perfect* run, no Tower verdict is issued because the agent makes the correct routing decision (ask, not run). The Behaviour Judge grades the routing decision itself — asking correctly = `PASS`. If the agent incorrectly runs a search on any of these three, Tower will issue `STOP` (or `CHANGE_PLAN`) and the Behaviour Judge will issue `WRONG_DECISION`.

---

## 6. Failure Mode Quick Reference

Use this to interpret non-perfect benchmark results:

| Tower Verdict | Behaviour Judge | Likely Interpretation |
|---|---|---|
| `ACCEPT` | `PASS` | Perfect run |
| `ACCEPT_WITH_UNVERIFIED` | `PASS` | Run succeeded but some evidence is unconfirmed; best-effort accepted |
| `ACCEPT` | `CAPABILITY_FAIL` | Tower accepted but judge found the agent's technique was flawed (lucky result) |
| `STOP` | `HONEST_PARTIAL` | Tower correctly stopped; world genuinely lacks results; agent did nothing wrong |
| `STOP` | `BATCH_EXHAUSTED` | Tower correctly stopped; more results exist but agent's search window too narrow |
| `STOP` | `CAPABILITY_FAIL` | Tower correctly stopped; agent's approach was flawed |
| `CHANGE_PLAN` | `BATCH_EXHAUSTED` | Tower triggered replan; agent needs wider scope |
| `STOP` | `WRONG_DECISION` | Agent ran when it should have asked; Tower stopped it |
| *(none)* | `WRONG_DECISION` | Agent asked when it should have run directly |
| *(none)* | `PASS` | Agent correctly asked for clarification (rows 4–6 above) |

---

*Source files:* `src/evaluator/towerVerdict.ts`, `src/evaluator/behaviourJudge.ts`, `src/evaluator/behaviourTests.ts`, `TOWER_JUDGEMENT_AUDIT.md`
