# Tower Verification & Judgement — Architecture Report

**Date:** 2026-03-18
**Purpose:** Forensic analysis of how Tower currently handles verification and judgement, to inform a planned architectural change where per-candidate Tower verification is eliminated and Tower only handles final delivery judgement.

---

## 1. INCOMING REQUEST TYPES

### Single Entry Point

All Tower judgement traffic enters through a single HTTP route:

**`POST /tower-verdict`** — defined in `server/routes-tower-verdict.ts` (line 348)

There is also a health check at `GET /tower-verdict/health` (line 21), and a separate route handler at `server/routes-judge-artefact.ts` which calls the same underlying `judgeLeadsList()` / `judgeLeadsListAsync()` functions for artefact-based runs.

### Branching by `artefactType`

The route handler branches on the `artefactType` field in the request body:

| `artefactType` value | Routing | Logic used |
|---|---|---|
| `"factory_state"` or `"factory_decision"` | Plastics injection path | `judgePlasticsInjection()` from `src/evaluator/plasticsInjectionRubric.ts` |
| `"leads_list"` or `"final_delivery"` | Main Wyshbone lead-list path | `judgeLeadsListAsync()` → `judgeLeadsList()` from `src/evaluator/towerVerdict.ts` |
| Any goal of `"Proof Tower Loop"` | Bypass / test path | `buildProofVerdict()` — forces a preset verdict without evaluation |

### Critical Finding: No Distinction Between Per-Candidate and Final Delivery Calls

**The `artefactType` values `"leads_list"` and `"final_delivery"` are accepted in the Zod schema but the handler does NOT branch on them.** Both flow through identical code — the same `judgeLeadsListAsync()` call, the same semantic enrichment, the same ground truth lookup, the same Behaviour Judge fire. There is no separate endpoint, no separate logic path, and no different evaluation strategy for mid-run candidate checks vs. end-of-run delivery. The distinction exists only in what is logged and what is persisted to the `tower_verdicts` table (where `artefact_type` is always written as `"leads_list"` regardless of the incoming `artefactType` value — see line 632).

**Key files:**
- `server/routes-tower-verdict.ts` — route handler and request validation (Zod schemas)
- `src/evaluator/towerVerdict.ts` — core verdict logic
- `src/evaluator/semanticEvidenceJudge.ts` — per-constraint semantic judge
- `src/evaluator/behaviourJudge.ts` — holistic post-verdict judge
- `src/evaluator/evidenceQualityJudge.ts` — evidence discipline enforcer

---

## 2. PER-CANDIDATE VERIFICATION

### How it Works

Per-candidate semantic verification is not a separate API call — it is a sub-step that runs inside the `/tower-verdict` handler before the main verdict pipeline. It activates when attribute evidence artefacts exist in the database for the run.

**Flow** (`server/routes-tower-verdict.ts`, lines 474–541):

1. If `run_id` is present and not `"none"`, Tower queries the `artefacts` table for rows where `type = 'constraint_led_evidence'` for that run.
2. Each row is mapped to an `AttributeEvidenceArtefact` object — one per lead per constraint.
3. If any `HAS_ATTRIBUTE` constraints are present in the request, `enrichAttributeEvidence()` is called from `src/evaluator/semanticEvidenceJudge.ts`. This runs the LLM semantic judge on each evidence item.
4. The enriched evidence (with `semantic_verdict`, `semantic_status`, `semantic_strength`, etc. attached) is passed into `judgeLeadsListAsync()` as the `attribute_evidence` field.

### Data Received Per Candidate

The `judgeEvidenceSemantically()` function in `src/evaluator/semanticEvidenceJudge.ts` (line 463) receives:

- `originalGoal` — the user's original goal string
- `constraint` — typed constraint object (`type`, `field`, `value`, `hardness`)
- `leadName` — business name being evaluated
- `evidenceQuote` — single text snippet from the evidence page
- `extractedQuotes` — array of snippets extracted from page text (preferred over `evidenceQuote`)
- `sourceUrl` — URL where evidence was gathered
- `pageTitle` — title of the evidence page
- `constraintRaw` — raw label for the constraint (display context)
- `attributeRaw` — raw label for the attribute (display context)
- `sourceTier` — evidence provenance tier (PHASE_4 field)
- `proofBurden` — required proof standard derived from `evidence_requirement` (PHASE_4 field)

### What it Returns — `SemanticJudgement`

```
{
  satisfies: "yes" | "no" | "unknown",
  status: "verified" | "weak_match" | "no_evidence" | "insufficient_evidence" | "contradicted",
  strength: "strong" | "indirect" | "weak" | "none",
  confidence: number (0.0–1.0),
  reasoning: string,
  supporting_quotes: string[] (up to 3),
  judge_mode: "llm" | "keyword_fallback"
}
```

These fields are written back onto the `AttributeEvidenceArtefact` as `semantic_verdict`, `semantic_status`, `semantic_strength`, `semantic_confidence`, `semantic_reasoning`, `semantic_supporting_quotes`.

### How `source_tier` and Evidence Weighting Work

`SourceTier` values: `"first_party_website" | "directory_field" | "search_snippet" | "lead_field" | "external_source" | "unknown"`

These map to a `ProofBurden`:
- `"none"` / `"lead_field"` evidence_requirement → `"self_evident"` burden
- `"directory_data"` / `"search_snippet"` → `"evidence_required"` burden
- `"website_text"` → `"evidence_required_first_party"` burden
- `"external_source"` → `"inherently_uncertain"` burden

**Key PHASE_4 behaviour** (`applyProofBurdenCap()`, line 445 of `semanticEvidenceJudge.ts`): If a constraint requires first-party website proof (`evidence_required_first_party`) but the source tier is NOT `"first_party_website"`, then even a `"verified"` LLM judgement is capped to `"weak_match"` with confidence ≤ 0.6. This cascades into `deriveConstraintVerdict()` where a `"weak_match"` semantic status yields `"PLAUSIBLE"` rather than `"VERIFIED"`.

### Three-Stage Judge — Fallback Chain

`judgeEvidenceSemantically()` runs three stages in order:

1. **Verbatim match** (`checkVerbatimMatch()`) — checks for the exact constraint phrase as a contiguous word-boundary match in the evidence text, with negation detection. Returns `"verified"` at confidence 0.95 if matched. Skips LLM call entirely.
2. **LLM judge** — calls `gpt-4o` (or `SEMANTIC_JUDGE_MODEL` env override) with the full semantic prompt if OpenAI key is set and no verbatim match found.
3. **Keyword fallback** (`keywordFallbackJudge()`) — token-overlap matching with negation detection. Used when: (a) no OpenAI key, (b) LLM returns empty response, (c) LLM response is unparseable, (d) LLM call throws.

**Key files and functions:**
- `src/evaluator/semanticEvidenceJudge.ts` — `judgeEvidenceSemantically()`, `enrichAttributeEvidence()`, `keywordFallbackJudge()`, `checkVerbatimMatch()`, `applyProofBurdenCap()`
- `src/evaluator/towerVerdict.ts` — `findAttributeEvidence()`, `evaluateConstraint()` (HAS_ATTRIBUTE branch), `deriveConstraintVerdict()`, `proofBurdenFromRequirement()`
- `server/routes-tower-verdict.ts` — DB query for attribute evidence artefacts (lines 474–541), semantic enrichment call (lines 529–541)

---

## 3. FINAL DELIVERY JUDGEMENT

### Call Chain

`judgeLeadsListAsync()` (exported, handles entity exclusions via LLM) → `judgeLeadsList()` (adds PHASE_5 hard constraint verdict fields) → `judgeLeadsListInner()` (orchestrates core + evidence quality + relationship + must-be-certain gates) → `judgeLeadsListCore()` (the main constraint evaluation loop)

**Key file:** `src/evaluator/towerVerdict.ts`

### Holistic Checks Performed (in order)

**Inside `judgeLeadsListCore()`:**
1. Count resolution — resolves `requested` and `delivered` counts from up to 11 input sources
2. Constraint evaluation per constraint type (NAME_CONTAINS, NAME_STARTS_WITH, LOCATION, COUNT_MIN, HAS_ATTRIBUTE)
3. Hard constraint gate — any failing hard constraint → CHANGE_PLAN (if replans remain) or STOP
4. Soft constraint check — soft failures append to gaps but do not block ACCEPT

**Post-core gates applied in `judgeLeadsListInner()`:**
5. **Evidence quality check** (`judgeEvidenceQuality()` from `evidenceQualityJudge.ts`) — checks per-lead `verified`/`evidence`/`source_url` fields. Can promote ACCEPT → STOP for: `VERIFIED_WITHOUT_EVIDENCE`, `NO_EVIDENCE_PRESENT`, `VERIFIED_EXACT_BELOW_REQUESTED`, `DELIVERY_SUMMARY_MISMATCH`, `PASS_WITHOUT_VERIFICATION`. Has two bypass conditions: self-evident constraints (TOWER_SELF_EVIDENT_FIX) and discovery_only + DIRECTORY_VERIFIED runs.
6. **Relationship predicate gate** — if goal contains relationship language ("works with", "supplies", "partner", etc.) OR `requires_relationship_evidence=true` is set, and `verified_relationship_count=0`, then ACCEPT → STOP with a specific stop reason code.
7. **Must-be-certain gate** — if `unresolved_hard_constraints` contains entries with `must_be_certain=true` and `verifiability` of `"proxy"` or `"unverifiable"`, then ACCEPT/ACCEPT_WITH_UNVERIFIED → STOP with code `MUST_BE_CERTAIN_VIOLATED`.
8. **Entity exclusion gate** (async, in `judgeLeadsListAsync()`) — if `intent_narrative.entity_exclusions` is present, an LLM call (gpt-4o-mini) checks each lead name against the exclusion list and removes matched leads before the verdict pipeline runs.
9. **Time predicate evaluation** (`evaluateTimePredicates()`) — handles temporal constraints (newly opened, opened in last N months, etc.) based on `time_predicates_mode` (verifiable/proxy/unverifiable).

**Holistic check also runs after the verdict: Behaviour Judge** (`fireBehaviourJudge()` in `behaviourJudge.ts`) — this is fired asynchronously, does not affect the Tower verdict returned to the caller, and is purely for audit/reporting.

### Possible Verdicts (Tower)

| Verdict | Action field | Meaning |
|---|---|---|
| `ACCEPT` | `"continue"` | All hard constraints passed, count met, evidence quality OK |
| `ACCEPT_WITH_UNVERIFIED` | `"continue"` | Best-effort accepted — constraints passed but evidence quality is borderline, and `best_effort_accepted=true` was sent |
| `CHANGE_PLAN` | `"change_plan"` | Hard constraints failed, replans remain within budget |
| `STOP` | `"stop"` | Cannot meet requirements honestly — either no replans left, evidence quality blocking, relationship unverified, or must-be-certain violated |

The upstream `delivery_summary` field (sent by the agent) can be `"PASS"`, `"PARTIAL"`, or `"STOP"` — this is checked in the evidence quality judge for consistency. A mismatch (e.g. `delivery_summary="PASS"` + Tower verdict `STOP`) triggers gap `DELIVERY_SUMMARY_MISMATCH`.

### Criteria Determining Each Verdict

- **ACCEPT:** `delivered >= requested`, all hard constraints pass (`matched_count = total_leads` or CVL status `"yes"`), no blocking evidence quality gaps, no unresolved relationship/must-be-certain violations.
- **ACCEPT_WITH_UNVERIFIED:** Same as ACCEPT but some constraint verdicts are PLAUSIBLE (not VERIFIED), and `best_effort_accepted=true` was in the payload — Tower has been told to accept partial evidence.
- **CHANGE_PLAN:** Any hard constraint fails AND `replans_used < max_replans`. Suggested changes are generated (EXPAND_AREA, RELAX_CONSTRAINT, etc.).
- **STOP:** Hard constraint fails with no replans remaining, OR delivered < requested after all replans, OR evidence quality gate fires, OR relationship gate fires, OR must-be-certain gate fires.

**Key files and functions:**
- `src/evaluator/towerVerdict.ts` — `judgeLeadsListCore()`, `judgeLeadsListInner()`, `judgeLeadsList()`, `judgeLeadsListAsync()`, `evaluateConstraint()`, `allHardConstraintsSelfEvident()`, `evaluateTimePredicates()`, `detectRelationshipPredicate()`
- `src/evaluator/evidenceQualityJudge.ts` — `judgeEvidenceQuality()`
- `src/evaluator/behaviourJudge.ts` — `judgeBehaviour()`, `fireBehaviourJudge()`, `inferQueryClass()`, `buildLeadsEvidence()`

### Behaviour Judge Verdicts (separate from Tower)

The Behaviour Judge (`judgeBehaviour()` in `behaviourJudge.ts`) produces three assessments — `mission_intent_assessment`, `ground_truth_assessment`, `combined_verdict` — each with one of:

| Verdict | Meaning |
|---|---|
| `PASS` | Fully met the request / fully matches reality |
| `HONEST_PARTIAL` | Good performance but real-world supply is genuinely limited |
| `BATCH_EXHAUSTED` | Technique sound but search scope too narrow; more results exist |
| `CAPABILITY_FAIL` | Agent missed findable things — bad queries, wrong verification, etc. |
| `WRONG_DECISION` | Wrong routing decision (ran when should have clarified, or vice versa) |

---

## 4. GROUND TRUTH LOOKUP

### Where It Happens

`server/routes-tower-verdict.ts`, lines 700–712 — runs after the Tower verdict is computed and persisted, immediately before firing the Behaviour Judge.

### Query Logic

```typescript
let gtRecord = null;
if (data.query_id || gtOriginalGoal) {
  gtRecord = await db.select()
    .from(groundTruthRecords)
    .where(
      data.query_id
        ? eq(groundTruthRecords.queryId, data.query_id)
        : eq(groundTruthRecords.queryText, gtOriginalGoal!)
    )
    .limit(1)
    .then(r => r[0] ?? null);
}
```

**Primary key:** `query_id` (from request body field `query_id`) → matches `groundTruthRecords.queryId` (column `query_id`, unique)

**Fallback when `query_id` is absent:** `gtOriginalGoal = data.original_goal ?? data.original_user_goal ?? null` → matches `groundTruthRecords.queryText` (column `query_text`, exact string equality, NOT a fuzzy match). This is a potential brittleness point — any change in how the goal string is formatted between the Tower call and the GT record entry will cause a miss.

### Table: `ground_truth_records` (`shared/schema.ts`, line 454)

| Column | Type | Purpose |
|---|---|---|
| `id` | serial PK | Internal identifier |
| `query_id` | text UNIQUE | Canonical lookup key (preferred) |
| `query_text` | text | Fallback lookup — raw goal string |
| `query_class` | text | Classification of the query type |
| `true_universe` | jsonb | Array of `{ name: string; ... }` — known true matches |
| `match_criteria` | text | Rules defining what counts as a valid match |
| `reasoning` | text | Rationale for the GT record |
| `notes` | text | Contextual notes |
| `created_at` | timestamp | Record creation time |

### Fields Passed to Behaviour Judge

```typescript
true_universe:  gtRecord?.trueUniverse  // jsonb → Array<{ name: string }>
match_criteria: gtRecord?.matchCriteria // text
ground_truth_notes: gtRecord?.notes     // text
gt_query_id:    gtRecord?.queryId       // text
```

If no GT record is found, all four fields are `null` and the Behaviour Judge produces `ground_truth_assessment: null`.

**Key files and functions:**
- `server/routes-tower-verdict.ts` — lines 697–736 (GT lookup + BJ fire)
- `shared/schema.ts` — `groundTruthRecords` table definition (line 454)
- `src/evaluator/behaviourJudge.ts` — `BehaviourJudgeInput` interface (receives GT data)

---

## 5. INPUT PARSING

### Constraint Parsing — `resolveConstraints()` (`towerVerdict.ts`, line 1075)

Tower accepts four different constraint formats, tried in priority order:

1. **Direct `constraints[]`** — typed array of `{ type, field, value, hardness, evidence_requirement, label }` objects. Normalised via `normalizeConstraintHardness()`. **Preferred format.**
2. **`structured_constraints[]`** — Supervisor-format array with `{ id, type, field, value, hard, hardness, operator, evidence_requirement, label }`. Mapped via `normalizeStructuredConstraint()` and the `SUPERVISOR_TYPE_MAP` (e.g. `LOCATION_EQUALS` → `LOCATION`).
3. **Legacy string arrays** — `hard_constraints` and `soft_constraints` as string arrays, parsed by `parseLegacyConstraintString()`. The parser attempts to extract type/field/value from free-text constraint strings.
4. **`success_criteria.hard_constraints` / `success_criteria.soft_constraints`** — fallback for older payload shapes.

### Delivered Count Resolution — `resolveDeliveredCount()` (line 367)

An 11-step priority chain, in order:
1. `delivered_leads.length` (explicit array of delivered leads — most authoritative)
2. `delivered_count` (numeric, if > 0 — TOWER_COUNT_FIX: moved up to prevent search pool contamination)
3. `leads.length`
4. `verification_summary.verified_exact_count`
5. `verified_exact` (if > 0)
6. `accumulated_count`
7. `delivered.delivered_matching_accumulated`
8. `delivered.delivered_matching_this_plan`
9. `delivered` (numeric)
10. `matchedLeadCount` (from constraint evaluation)
11. Default `0`

The source used is recorded in `result._debug.source` for traceability.

### Known Parsing Issues

#### "organisations" British Spelling — NOT a Code Bug

The word "organisations" (British spelling) appears in the Behaviour Judge system prompt (`behaviourJudge.ts`, line 205) in the description of the `relationship` query class: `"relationship: find organisations that work with / are connected to another entity"`. This is documentation text inside the LLM prompt — it is not used in any string matching, parsing, or filtering code, and does not cause any bugs.

However, there IS a meaningful **constraint key normalisation** point that warrants attention: `normalizeAttributeKey()` (`towerVerdict.ts`, line 436) strips the `c_attr_` prefix and normalises underscores/hyphens/spaces. If the attribute key from the Supervisor uses a slightly different spelling or delimiter than the key stored in `attributeEvidence`, the `findAttributeEvidence()` lookup will fail silently and fall back to upstream verdicts. The matching is case-insensitive and normalises separators, but there is no fuzzy matching for spelling variations.

#### Attribute Evidence Matching — Potential Misses

`findAttributeEvidence()` (line 445) first tries `place_id` matching (most reliable), then falls back to exact case-insensitive name matching on `lead_name`. If the lead name in the evidence artefact differs even slightly from the lead name in the request (e.g. different capitalisation, trailing punctuation, "The" prefix), the evidence will not be found and the constraint will fall back to the upstream CVL verdict.

#### Legacy Constraint String Parsing

`parseLegacyConstraintString()` uses a series of regex patterns to extract constraint info from free-text strings. This is brittle and is the last-resort fallback — there is no documented guarantee of correctness for arbitrary string formats.

#### Text Encoding

No explicit encoding normalisation is performed on constraint values or evidence text. The keyword fallback judge (`keywordFallbackJudge()`) lowercases and strips non-alphanumeric characters (`/[^a-z0-9\s]/g`) for token matching, which handles most special characters and accented characters by dropping them. This means a constraint like "café" and evidence containing "cafe" will not match verbatim but may partially match via token overlap.

**Key files and functions:**
- `src/evaluator/towerVerdict.ts` — `resolveConstraints()`, `resolveDeliveredCount()`, `resolveRequestedCount()`, `resolveLeads()`, `normalizeAttributeKey()`, `findAttributeEvidence()`, `parseLegacyConstraintString()`, `normalizeStructuredConstraint()`
- `src/evaluator/semanticEvidenceJudge.ts` — `tokenizeForMatch()`, `keywordFallbackJudge()`

---

## 6. SYSTEM PROMPT

### Semantic Evidence Judge System Prompt

**File:** `src/evaluator/semanticEvidenceJudge.ts`, constant `SYSTEM_PROMPT` (lines 19–74)
**Model:** `process.env.SEMANTIC_JUDGE_MODEL ?? "gpt-4o"`, temperature `0.1`, max_tokens `400`

```
You are Tower, the judgement layer for Wyshbone.

Your job is NOT to judge whether a tool ran successfully.
Your job IS to judge whether the evidence produced by the tool helps satisfy the user's original request.

You will receive:
- original_user_goal
- lead_name (business name)
- constraint_to_check (the structured constraint)
- constraint_raw and attribute_raw (raw labels for context)
- source_url
- evidence_text (one or more snippets extracted from a web page)
- page_title

You must decide whether the evidence supports the constraint.

Rules:
1. Do NOT pass just because the tool executed successfully.
2. Ignore tool success unless the evidence itself is missing.
3. Judge only against the user's real constraint.
4. Be strict and honest.
5. If the page text does not support the constraint, say so.
6. If the evidence is indirect, weak, ambiguous, or inferred, say so clearly.
7. Prefer "no_evidence" over pretending verification.
8. Extract up to 3 short supporting quotes from the evidence text when available.
9. Never invent quotes.
10. Never say "verified" unless the evidence genuinely supports the constraint.
```

**Required JSON response shape:**
```json
{
  "judgement_type": "attribute_verification",
  "satisfies": true,
  "status": "verified",
  "strength": "strong",
  "confidence": 0.91,
  "reason": "...",
  "supporting_quotes": ["..."]
}
```

**Allowed status values:** `"verified" | "weak_match" | "no_evidence" | "insufficient_evidence"`
**Decision guidance:**
- `verified` = explicit or very strong support
- `weak_match` = partial / indirect support
- `no_evidence` = no meaningful support in the text
- `insufficient_evidence` = page failed, empty text, or unusable evidence

Note: The `"contradicted"` status exists in the TypeScript type (`SemanticStatus`) and is handled by the keyword fallback judge (`keywordFallbackJudge()`) via negation detection, but it is **not listed in the LLM system prompt** as an allowed value. The LLM cannot produce `"contradicted"` — only the deterministic keyword fallback path can.

### Behaviour Judge System Prompt

**File:** `src/evaluator/behaviourJudge.ts`, constant `BEHAVIOUR_JUDGE_SYSTEM_PROMPT` (lines 195–354)
**Model:** `process.env.BEHAVIOUR_JUDGE_MODEL ?? "gpt-4o"`, temperature `0.15`, max_tokens `1800`

The Behaviour Judge is instructed to produce three independent assessments in one call:
1. `mission_intent_assessment` — was the agent's execution correct for the query type?
2. `ground_truth_assessment` — did the agent find the known true matches? (only when GT data is present)
3. `combined_verdict` — synthesis of both dimensions

**Key instructions on evidence weighting:**
- `first_party` evidence (business's own website) is strongest — VERIFIED + first_party = high confidence
- `third_party` (directories, review sites) is good but may be outdated
- `snippet` only is weak — critical constraints relying only on snippets lean toward CAPABILITY_FAIL
- For `website_evidence` queries: snippet-only without visiting the page = CAPABILITY_FAIL; visited pages with no evidence found = not penalised
- For `relationship` queries: concrete evidence of the relationship required, not just co-mentions
- Bot-blocking rule: ≥3 bot-blocked leads on a `website_evidence` query → HONEST_PARTIAL (not CAPABILITY_FAIL)
- Entity exclusions: lower count caused by exclusions is correct behaviour — not penalised
- GT epistemological rule: absence from `true_universe` does NOT confirm a false positive — GT may be incomplete

**Confidence:** Expressed as integer 0–100 in the Behaviour Judge response (not 0.0–1.0 like the semantic judge).

---

## SUMMARY: What Happens on a Typical `/tower-verdict` Call

```
POST /tower-verdict (routes-tower-verdict.ts)
  │
  ├─ Validate with towerVerdictRequestSchema (Zod)
  │
  ├─ Fetch attribute_evidence artefacts from DB (artefacts table, type='constraint_led_evidence')
  │
  ├─ If HAS_ATTRIBUTE constraints exist AND evidence found:
  │    enrichAttributeEvidence() → judgeEvidenceSemantically() per lead per constraint
  │    [LLM: gpt-4o via SEMANTIC_JUDGE_MODEL, or keyword fallback]
  │
  ├─ judgeLeadsListAsync() (towerVerdict.ts)
  │    ├─ Entity exclusion LLM check (if entity_exclusions in intent_narrative)
  │    └─ judgeLeadsList() → judgeLeadsListInner() → judgeLeadsListCore()
  │         ├─ resolveConstraints() — normalise from 4 possible formats
  │         ├─ resolveRequestedCount() — 3-source priority
  │         ├─ resolveDeliveredCount() — 11-source priority chain
  │         ├─ evaluateConstraint() per constraint (with CVL + attribute evidence)
  │         ├─ Hard/soft constraint gating → initial ACCEPT/CHANGE_PLAN/STOP
  │         ├─ judgeEvidenceQuality() — evidence discipline check
  │         ├─ Relationship predicate gate
  │         ├─ Must-be-certain gate
  │         └─ Return TowerVerdict { verdict, action, delivered, requested, gaps, ... }
  │
  ├─ persistTowerVerdict() → tower_verdicts table
  │
  ├─ GT lookup: groundTruthRecords by query_id → fallback to queryText
  │
  └─ fireBehaviourJudge() [async, non-blocking]
       └─ judgeBehaviour() [gpt-4o]
            → behaviourJudgeResults table
```

---

## ARCHITECTURAL IMPLICATIONS FOR PLANNED CHANGE

The planned change is to **eliminate per-candidate Tower verification and have Tower handle only final delivery judgement**. The current system has these per-candidate verification components that would need to be relocated or removed:

1. **`enrichAttributeEvidence()` / `judgeEvidenceSemantically()`** — currently called inside the `/tower-verdict` route, triggered by DB artefact lookup per run. If Tower no longer handles per-candidate verification, this call would move to the upstream agent (Supervisor/CVL layer) which generates the attribute evidence artefacts.

2. **`attributeEvidence` field in `TowerVerdictInput`** — currently populated from DB artefacts and passed into the verdict pipeline. If pre-enriched, the Supervisor would send `semantic_verdict` fields already populated and Tower would use them directly without calling `enrichAttributeEvidence()`.

3. **The `evaluateConstraint()` HAS_ATTRIBUTE path** — currently handles both: using CVL status directly (when `cvlMatch` exists) OR looking up attribute evidence and applying semantic overrides. If all verification is done upstream, Tower would only need to consume the CVL `constraint_results` summary.

4. **`judgeEvidenceQuality()`** — this checks per-lead `verified`/`evidence`/`source_url` fields. In the new architecture, if verification is entirely upstream, Tower would need to know what the upstream claimed verified and rely on counts rather than per-lead fields.

5. **The `artefacts` DB query** (lines 474–526 of `routes-tower-verdict.ts`) — fetches per-candidate evidence from DB. This would not be needed if the Supervisor delivers pre-enriched evidence in the request payload.

---

## BUG FIX LOG — Corruption Detection False Positive ("organisations")

**Date:** 2026-03-18
**Issue:** Tower was returning `CHANGE_PLAN` with stop code `INPUT_CONCATENATED` and rationale `"Input appears corrupted. Input appears concatenated: 'organisations' looks like words merged without spaces."` for valid deliveries containing the word "organisations".

---

### Where the Check Was

**File:** `src/evaluator/towerVerdict.ts`
**Function:** `detectConcatenationArtifacts()` (line 903)
**Call site:** `judgeLeadsListCore()` (line 2024), passing `[artefact_title, artefact_summary, goal]`

The function ran as an early gate inside `judgeLeadsListCore()`, before any constraint evaluation. A `corrupted: true` result caused an immediate `CHANGE_PLAN` return, bypassing all further logic.

---

### What the Check Did

The function had three detection paths:

**Check 1 — Question in parentheses** (kept unchanged):
```
/\([^)]{40,}\?\s*\)/
```
Flags text like `(How do I find a supplier that works with local authorities?)` — a question of 40+ chars embedded in parentheses.

**Check 2 — Triple-repeated words** (kept unchanged):
Splits the text on whitespace and looks for three consecutive identical words of length ≥ 3.

**Check 3 — Verb-substring concatenation** (THE PROBLEMATIC CHECK — removed):
```javascript
const concatPatterns = [
  lower.match(/\b([a-z]{2,})(can|could|should|would|will|shall|does|did|is|are|was|were|have|has|had)([a-z]{2,})\b/),
  lower.match(/\b([a-z]{3,})(can|could|should|would|will|shall|does|did|is|are|was|were|have|has|had)\b/),
];
```
This looked for any token where an auxiliary verb (`is`, `are`, `was`, `can`, `have`, etc.) appeared as a substring, treating it as evidence of merged words. The intent was to catch things like `"Walescan"` → `"Wales" + "can"`.

To suppress false positives, a `knownSafe` regex was added listing hundreds of real English words that happened to contain these verb substrings (e.g. `american`, `organ`, `island`, `history`, `consistent`, etc.). This list was the fundamental problem — it was attempting to enumerate all legitimate English words containing auxiliary verb substrings, which is an unbounded set.

**Why "organisations" was flagged:**
The word "organisations" matches pattern 1 as `organ` + `is` + `ations`. The `knownSafe` list contained `organ` but not `organisations` (or `organisation`, `organisational`, `disorganisation`, etc.). The regex tests the full matched token — `concatMatch[0]` = `"organisations"` — against `knownSafe`, which does not include it, so it was flagged as corrupted.

---

### Has This Check Ever Caught Genuine Corruption?

There is no evidence in the codebase, audit logs, or documentation that Check 3 ever caught a genuinely corrupted input that slipped through the upstream pipeline (intent extraction, constraint mapping, plan generation, search execution). The check was added proactively, not in response to a real observed failure.

Furthermore, by the time a delivery reaches Tower for final judgement, the input has passed through:
- User goal parsing and intent extraction
- Constraint normalisation and structured mapping
- Plan generation (which must produce coherent search queries)
- Search execution
- Evidence gathering and CVL evaluation

Any genuinely garbled or concatenated goal text would have caused failures at one of these earlier stages. A goal like `"findorganisationsthatwork"` could not produce a valid plan, constraints, or leads.

---

### What Was Changed

**Removed** the entire verb-substring concatenation check (Check 3), including:
- Both regex patterns in `concatPatterns`
- The `knownSafe` whitelist regex (800+ chars, listing hundreds of real English words)
- The loop over `concatPatterns`
- The `lower` variable that was only used by this check

**Replaced** with a minimal, reliable check: flag text that has **literally no whitespace at all** and is **≥ 30 characters long**. This corresponds to the only type of garbled input that is genuinely unambiguous — multiple real words merged into a single unspaced string. The 30-character threshold is safely above the longest common single English words (~20 chars), meaning no legitimate single-word string will ever be flagged.

```javascript
// Before (removed):
const lower = text.toLowerCase();
const concatPatterns = [
  lower.match(/\b([a-z]{2,})(can|...)(is|...)([a-z]{2,})\b/),
  ...
];
for (const concatMatch of concatPatterns) {
  if (!concatMatch) continue;
  const full = concatMatch[0];
  const knownSafe = /^(american|african|...|organisations...)/;
  if (!knownSafe.test(full)) { return { corrupted: true, ... }; }
}

// After (replacement):
if (!/\s/.test(text) && text.length >= 30) {
  return {
    corrupted: true,
    reason: `Input appears concatenated: "${text.substring(0, 40)}" contains no spaces and is likely multiple words merged together.`,
  };
}
```

**Also updated:** `replit.md` — corrected the Concatenation Artifact Detection entry to describe the current behaviour.

---

### Tests

- `"organisations"` → `{ corrupted: false }` ✓ (13 chars, would have spaces in context anyway)
- `"Find organisations working with the local authority"` → `{ corrupted: false }` ✓ (has spaces)
- `"findorganisationsthatworkwiththelocalauthority"` (46 chars, no spaces) → `{ corrupted: true }` ✓
- `"Walescan"` (8 chars, no spaces) → `{ corrupted: false }` — correctly NOT flagged (too short to be multiple merged words; ambiguous)
- A goal with a 40-char parenthesised question → `{ corrupted: true }` ✓ (Check 1 still active)
- A goal with three consecutive identical words → `{ corrupted: true }` ✓ (Check 2 still active)

---

## CHANGE LOG — combined_delivery Artefact Type Support

**Date:** 2026-03-20

### What Changed

**File:** `server/routes-judge-artefact.ts`, line 492 (now 495 after prior edits)

**Change:** Added `"combined_delivery"` as an accepted artefact type in the branch that routes to the full leads-list judgement pipeline.

**Before:**
```typescript
if (artefactType === "leads_list" || artefactType === "final_delivery") {
```

**After:**
```typescript
if (artefactType === "leads_list" || artefactType === "final_delivery" || artefactType === "combined_delivery") {
```

### Why

The reloop architecture merges results from multiple iteration passes into a single combined delivery before sending to Tower for final judgement. This merged payload uses `artefactType: "combined_delivery"` to distinguish it from single-pass `final_delivery` artefacts. Without this change, `combined_delivery` artefacts fell through the `if` branch entirely and were processed by a different code path (the non-leads-list path), which does not perform constraint evaluation, evidence quality checks, or relationship gating.

The `combined_delivery` payload structure is identical to `final_delivery` — same `leads` array, `constraints`, `verification_summary`, `attribute_evidence`, etc. — so no changes to the judgement logic itself were needed. The existing pipeline handles it correctly once the type is accepted.

### Decisions Made

- Only the type-gate condition was changed. No judgement logic, schema validation, or persistence code was modified.
- The `artefact_type` stored in the `tower_verdicts` table will be `"combined_delivery"` (passed through as-is from `artefactType`), which correctly distinguishes these verdicts from single-pass records in audit queries.
- No Zod schema change was required — the `artefactType` field in the `judge-artefact` route is read directly from the request body before schema validation of the payload.

### Files Modified

| File | Change |
|---|---|
| `server/routes-judge-artefact.ts` | One-line addition of `combined_delivery` to artefact type gate |
| `AGENT_LOG.md` | This entry |

### What's Next

- The Supervisor / reloop layer can now POST `combined_delivery` artefacts to `/api/tower/judge-artefact` and receive a full Tower verdict (ACCEPT / CHANGE_PLAN / STOP) with constraint results, evidence quality checks, and Behaviour Judge scoring.
- If the combined delivery needs different verdict handling downstream (e.g. no replanning suggested since all iterations are complete), the Supervisor should inspect `artefact_type === "combined_delivery"` in the response and suppress CHANGE_PLAN handling accordingly — Tower itself will still return CHANGE_PLAN if constraints are unmet, as it has no knowledge of reloop exhaustion.
