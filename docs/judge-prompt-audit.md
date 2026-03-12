# Judge Prompt & Model Configuration Audit

**Generated:** March 11, 2026  
**Purpose:** Exact record of every LLM call in the verdict/judgement pipeline — prompts verbatim, model strings, input fields, output schemas.

---

## IMPORTANT CORRECTION: TOWER VERDICT IS NOT AN LLM CALL

The **Tower verdict itself is fully deterministic**. There is no LLM system prompt for Tower. The `judgeLeadsList()` function in `src/evaluator/towerVerdict.ts` evaluates constraints using pure TypeScript logic: regex name matching, numeric count comparison, CVL result lookups, and a cascade of gates (evidence quality, relationship predicate, time predicate, truth gate). No model is queried to produce `ACCEPT`, `ACCEPT_WITH_UNVERIFIED`, `CHANGE_PLAN`, or `STOP`.

What Tower *does* do is call the **Semantic Evidence Judge** (see §3 below) *before* it evaluates constraints, to enrich `HAS_ATTRIBUTE` evidence with semantic verdicts. That enrichment is an LLM call; the verdict logic that follows it is not.

---

## 1. TOWER JUDGE — Deterministic (No LLM)

**Model:** None  
**System prompt:** None  
**Called from:** `src/evaluator/towerVerdict.ts` → `judgeLeadsList()`  
**HTTP entry point:** `POST /tower-verdict` in `server/routes-tower-verdict.ts`

### Input fields accepted at the HTTP layer (Zod schema)

```
artefactType           "leads_list" | "final_delivery"
run_id                 string (optional)
artefactId             string (optional)
goal                   string (optional)
proof_mode             string (optional)
idempotency_key        string (optional)

original_goal          string (optional)
original_user_goal     string (optional)
normalized_goal        string (optional)

leads                  Lead[] (optional)        — { name: string, address?: string, ...passthrough }
delivered_leads        Lead[] (optional)
constraints            Constraint[] (optional)  — see constraint schema below
requested_count_user   int (optional)
requested_count        int (optional)
accumulated_count      int (optional)
delivered_count        int (optional)
verified_exact         int (optional)
delivered              DeliveredInfo | number (optional)

success_criteria       object (optional)
  requested_count_user   int
  target_count           int
  hard_constraints       array
  soft_constraints       array
  allow_relax_soft_constraints  boolean

meta                   object (optional)
  plan_version           number
  replans_used           number
  max_replans            number
  radius_km              number
  relaxed_constraints    string[]

plan                   unknown (optional)
plan_summary           unknown (optional)
plan_version           number (optional)
radius_km              number (optional)
attempt_history        AttemptHistoryEntry[] (optional)  — { plan_version, radius_km, delivered_count }

hard_constraints       string[] (optional)      — legacy string form
soft_constraints       string[] (optional)      — legacy string form

artefact_title         string (optional)
artefact_summary       string (optional)

verification_summary   object (optional)
  verified_exact_count   number
  constraint_results     CvlConstraintResult[]

constraints_extracted  object (optional)
  requested_count_user   int
  constraints            Constraint[]

delivery_summary       "PASS" | "PARTIAL" | "STOP" (optional)

requires_relationship_evidence  boolean (optional)
verified_relationship_count     number (optional)

time_predicates        { predicate: string, hardness: "hard"|"soft" }[] (optional)
time_predicates_mode   "verifiable" | "proxy" | "unverifiable" (optional)
time_predicates_proxy_used  "news_mention" | "recent_reviews" | "new_listing" |
                             "social_media_post" | "press_release" | null (optional)
time_predicates_satisfied_count  int (optional)
time_predicates_unknown_count    int (optional)

unresolved_hard_constraints  array (optional)
  constraint_id    string
  label            string
  verifiability    "verifiable" | "proxy" | "unverifiable"
  proxy_selected   string | null
  must_be_certain  boolean

best_effort_accepted         boolean (optional)
verification_policy          string (optional)
strategy                     string (optional)
agent_clarified              boolean (optional)

query_shape_key              string (optional)
steps_count                  int (optional)
tool_calls                   int (optional)
current_search_budget_pages  int (optional)
current_verification_level   "minimal" | "standard" | "strict" (optional)
current_radius_escalation    "conservative" | "moderate" | "aggressive" (optional)
```

Constraint schema:
```
type               "NAME_CONTAINS" | "NAME_STARTS_WITH" | "LOCATION" | "COUNT_MIN" | "HAS_ATTRIBUTE"
field              string
value              string | number
hardness           "hard" | "soft" (optional)
evidence_requirement  "none" | "lead_field" | "directory_data" | "search_snippet" |
                      "website_text" | "external_source" (optional)
label              string (optional)
```

### Output schema (TowerVerdict)

```json
{
  "verdict":            "ACCEPT" | "ACCEPT_WITH_UNVERIFIED" | "CHANGE_PLAN" | "STOP",
  "action":             "continue" | "change_plan" | "stop",
  "delivered":          number,
  "requested":          number,
  "gaps":               string[],
  "confidence":         number,
  "rationale":          string,
  "suggested_changes":  SuggestedChange[],
  "constraint_results": ConstraintResult[] | undefined,
  "stop_reason":        { code: string, message: string, detail?: string, evidence?: object } | undefined,
  "failing_constraint_id":     string | undefined,
  "failing_constraint_reason": string | undefined,
  "hard_constraint_verdicts":  { id: string, verdict: string, label: string }[] | undefined,
  "persisted":          boolean,
  "duplicate":          boolean
}
```

---

## 2. BEHAVIOUR JUDGE — LLM Call

**Model:** `process.env.BEHAVIOUR_JUDGE_MODEL ?? "gpt-4o"`  
**Default model string:** `gpt-4o`  
**Temperature:** `0.15`  
**Max tokens:** `600`  
**Called from:** `src/evaluator/behaviourJudge.ts` → `judgeBehaviour()` / `fireBehaviourJudge()`  
**Gated by:** `process.env.BEHAVIOUR_JUDGE_ENABLED === "true"` — if not set, this call is **skipped entirely**

### System prompt (verbatim)

```
You are the Behaviour Judge for Wyshbone. You receive the result of a completed agent run and must classify the agent's BEHAVIOUR into exactly one outcome.

You will receive: the user's original goal, the query class, the strategy used, how many leads were delivered vs requested, per-lead evidence with source tiers, full constraint verdicts with evidence quotes, Tower's verdict and gaps, and whether the agent clarified or ran directly.

## Input context

query_class: What type of query this was.
  - simple_discovery: find businesses matching a location/category (e.g. "pubs in York")
  - name_match: find businesses with a specific name pattern (e.g. "pubs with Swan in the name")
  - website_evidence: find businesses whose website mentions something specific
  - relationship: find organisations that work with / are connected to another entity
  - clarify_required: the goal is ambiguous, fictional, or missing critical info

leads_evidence: Per-lead evidence context. Each entry includes:
  - source_tier: "first_party" (business's own website), "third_party" (TripAdvisor, Google Maps, directories), or "snippet" (search snippet only, no page fetched)
  - evidence_text: The actual page text or snippet fetched for this lead. First-party evidence is the most reliable.
  - verified: Whether the lead was marked as verified.

constraint_verdicts: Full per-constraint results including:
  - verdict: VERIFIED, PLAUSIBLE, UNSUPPORTED, CONTRADICTED, or NOT_APPLICABLE
  - reason: Why this verdict was given
  - quote: The evidence text supporting the verdict
  - source_tier: Where the evidence came from
  - matched_count / total_leads: How many leads matched this constraint

## The five outcomes

PASS
  The agent met the request. Enough leads delivered, constraints satisfied or plausibly met, evidence correctly handled. No action needed.

HONEST_PARTIAL
  The agent performed well — good queries, correct interpretation, proper verification — but the real world simply doesn't have enough matching results. The shortfall is genuine scarcity, not agent error. Example: user asks for 10 vegan restaurants in a small village; only 3 exist.

BATCH_EXHAUSTED
  The agent performed well within the search batch it used, but the batch was too narrow. More matching results likely exist in the world but the agent's search parameters (radius, keywords, page depth) didn't reach them. A wider or different search would likely find more. Example: searched 5km radius when 15km would have found more matches.

CAPABILITY_FAIL
  The agent missed findable things. Bad search queries, missed obvious evidence on pages it visited, wrong interpretation of constraints, failed to filter correctly, or didn't verify when it should have. The results exist and were reachable but the agent failed to find or process them.

WRONG_DECISION
  The agent made the wrong routing decision. It ran a search when it should have asked a clarifying question first (ambiguous goal, missing key info), OR it asked for clarification when the goal was clear enough to act on.

## Key distinctions

HONEST_PARTIAL vs BATCH_EXHAUSTED:
  Both involve a shortfall with competent agent work. HONEST_PARTIAL = the world genuinely lacks results. BATCH_EXHAUSTED = results exist but the search window was too narrow. Ask: "Would a broader search plausibly find more?" If yes -> BATCH_EXHAUSTED. If no -> HONEST_PARTIAL.

BATCH_EXHAUSTED vs CAPABILITY_FAIL:
  BATCH_EXHAUSTED = the agent's technique was sound but scope was limited. CAPABILITY_FAIL = the agent's technique was flawed (wrong queries, missed evidence, bad filtering). Ask: "Was the agent's approach correct within what it searched?" If yes -> BATCH_EXHAUSTED. If no -> CAPABILITY_FAIL.

CAPABILITY_FAIL vs WRONG_DECISION:
  CAPABILITY_FAIL = correct decision to run, poor execution. WRONG_DECISION = should not have run (or should have run but asked instead).

## Evidence evaluation guidance

- first_party evidence (from the business's own website) is the strongest signal. If a constraint is VERIFIED with first_party evidence, that is high confidence.
- third_party evidence (directories, review sites) is good but may be outdated or incomplete.
- snippet evidence (search result snippets only) is weak — the agent should have fetched the page for stronger verification. If critical constraints rely only on snippet evidence, consider CAPABILITY_FAIL.
- For website_evidence queries: if the agent only checked snippets but didn't actually visit the website, that is a CAPABILITY_FAIL.
- For relationship queries: look for concrete evidence of the relationship, not just co-mentions.

## Response format

Respond with valid JSON only, no markdown fences:
{
  "outcome": "PASS",
  "reason": "Brief explanation of why this outcome was chosen.",
  "confidence": 85
}
```

### User message (dynamically built)

JSON object with these fields:

```
original_goal          string
query_class            "simple_discovery" | "name_match" | "website_evidence" | "relationship" | "clarify_required"
strategy               string | null
verification_policy    string | null
delivered_count        number
requested_count        number | null
constraints            { type, field, value, hardness }[]
constraint_verdicts    { type, field, value, hardness, verdict, reason?, quote?, source_tier?, matched_count?, total_leads? }[]
tower_verdict          string
tower_gaps             string[]
tower_stop_reason_code string | null
agent_clarified        boolean
leads_evidence         { lead_name, source_tier, verified, source_url?, evidence_text? }[]  (if any)
```

### Output schema

```json
{
  "outcome":    "PASS" | "HONEST_PARTIAL" | "BATCH_EXHAUSTED" | "CAPABILITY_FAIL" | "WRONG_DECISION",
  "reason":     string,
  "confidence": number (0–100)
}
```

Persisted to `behaviour_judge_results` table with: `run_id`, `outcome`, `reason`, `confidence`, `tower_verdict`, `delivered_count`, `requested_count`, `input_snapshot`.

---

## 3. SEMANTIC EVIDENCE JUDGE — LLM Call (Active)

**Model:** `process.env.SEMANTIC_JUDGE_MODEL ?? "gpt-4o"`  
**Default model string:** `gpt-4o`  
**Temperature:** `0.1`  
**Max tokens:** `400`  
**Called from:** `src/evaluator/semanticEvidenceJudge.ts` → `judgeEvidenceSemantically()`  
**Invoked by:** `server/routes-tower-verdict.ts` → `enrichAttributeEvidence()` — called *before* Tower evaluates constraints, only when `HAS_ATTRIBUTE` constraints are present and `attribute_evidence` artefacts exist for the run  
**Status:** **Active**

### Execution order (important)

The Semantic Evidence Judge runs *before* the Tower verdict computation:

1. `POST /tower-verdict` received
2. Tower fetches `attribute_evidence` artefacts from DB for the `run_id`
3. If `HAS_ATTRIBUTE` constraints exist → `enrichAttributeEvidence()` is called
4. For each evidence item with extractedQuotes/quote text → `judgeEvidenceSemantically()` is called
5. Enriched evidence (with `semantic_verdict`, `semantic_status`, `semantic_strength`, `semantic_confidence`, `semantic_reasoning`, `semantic_supporting_quotes`) is passed to `judgeLeadsList()`
6. Tower's deterministic constraint evaluator uses the semantic result to derive the constraint verdict

### Pre-LLM fast paths (LLM is NOT called if these match first)

1. **No evidence text** — returns `insufficient_evidence` immediately without calling LLM
2. **Verbatim phrase match** — if the multi-word constraint value appears verbatim (word-boundary matched, not negated) in the evidence text, returns `verified / strong / 0.95` without calling LLM
3. **No API key** — falls back to keyword-based judge without calling LLM

### System prompt (verbatim)

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

You MUST respond with valid JSON in this exact shape:

{
  "judgement_type": "attribute_verification",
  "satisfies": true,
  "status": "verified",
  "strength": "strong",
  "confidence": 0.91,
  "reason": "The page explicitly mentions vegan brunch, which supports the vegan food constraint.",
  "supporting_quotes": [
    "Had a vegan brunch in Manchester at Pot Kettle Black"
  ]
}

Allowed values:
- status: "verified" | "weak_match" | "no_evidence" | "insufficient_evidence"
- strength: "strong" | "indirect" | "weak" | "none"

Decision guidance:
- verified = explicit or very strong support
- weak_match = partial / indirect support
- no_evidence = no meaningful support in the text
- insufficient_evidence = page failed, empty text, or unusable evidence

Important:
A successful crawl is NOT a successful verification.
A successful tool call with no relevant text should usually be:
status = "no_evidence"
```

### User message (dynamically built)

JSON object with these fields:

```
original_user_goal     string
lead_name              string
constraint_to_check    { type, field, value, hardness }
constraint_raw         string | null
attribute_raw          string | null
source_url             string | null
page_title             string | null
evidence_text          string[] | null   (extracted_quotes or evidenceQuote, up to full length)
```

### Output schema (expected from LLM)

```json
{
  "judgement_type":   "attribute_verification",
  "satisfies":        true | false | "yes" | "no" | "unknown",
  "status":           "verified" | "weak_match" | "no_evidence" | "insufficient_evidence",
  "strength":         "strong" | "indirect" | "weak" | "none",
  "confidence":       number (0.0–1.0),
  "reason":           string,
  "supporting_quotes": string[]
}
```

Internally normalised to `SemanticJudgement`:

```typescript
{
  satisfies:         "yes" | "no" | "unknown"
  status:            "verified" | "weak_match" | "no_evidence" | "insufficient_evidence"
  strength:          "strong" | "indirect" | "weak" | "none"
  confidence:        number
  reasoning:         string
  supporting_quotes: string[]
  judge_mode:        "llm" | "keyword_fallback"
}
```

### Proof burden cap (post-LLM, Phase 4)

After the LLM responds, if `evidence_requirement=website_text` and `source_tier` is not `first_party_website`, any `verified` result is **downgraded** to `weak_match / indirect / max 0.6 confidence`. This is applied to both LLM and keyword-fallback results.

### Keyword fallback (when LLM unavailable)

If the OPENAI_API_KEY is absent/placeholder, the LLM call is replaced by a local keyword-matching algorithm:
- Tokenises the constraint value and looks for token overlap in evidence texts
- Detects negation patterns (`no`, `not`, `never`, `without`, `no longer`, `formerly`, etc.) within a 50-character window around each match
- Returns `contradicted` if all matches are negated; `weak_match` with `indirect/weak` strength for positive matches; `no_evidence` for no matches
- `judge_mode` is set to `"keyword_fallback"` so results can be distinguished from LLM judgements

---

## 4. EVIDENCE QUALITY JUDGE — Deterministic (No LLM)

**Model:** None  
**Called from:** `src/evaluator/evidenceQualityJudge.ts` → `judgeEvidenceQuality()`  
**Invoked by:** `towerVerdict.ts` → `judgeLeadsListInner()` — runs immediately after the core constraint evaluation, before relationship/time/truth gates

This is a pure rule-based check. It inspects whether leads marked `verified=true` have real supporting evidence (`evidence` field, `source_url`, or `verified_exact_count`). It produces gap codes and can downgrade `ACCEPT → STOP`. No LLM is involved.

Gap codes it can emit: `VERIFIED_WITHOUT_EVIDENCE`, `NO_EVIDENCE_PRESENT`, `VERIFIED_EXACT_BELOW_REQUESTED`, `DELIVERY_SUMMARY_MISMATCH`, `PASS_WITHOUT_VERIFICATION`.

---

## 5. OTHER LLM CALLS IN THE BROADER PIPELINE

These are not part of the real-time verdict loop (they run asynchronously or on-demand as part of the investigation/diagnosis system), but they are LLM calls in the same codebase.

### 5a. Run Diagnosis (Investigation System)

**File:** `src/evaluator/runDiagnosis.ts` → `runDiagnosis()`  
**Model:** `process.env.EVAL_MODEL_ID ?? "gpt-4o-mini"`  
**Default model string:** `gpt-4o-mini`  
**Temperature:** `0.2`  
**Max tokens:** Unlimited (no `max_tokens` set)  
**When called:** On-demand when a failing run is flagged for investigation

**System prompt (verbatim, inline string — no named constant):**

```
You are the Wyshbone Evaluator. You receive logs from a failing or suspicious run, plus optional code snapshots from the UI and Supervisor.

Output your response in TWO sections:

## DIAGNOSIS
[Explain the root cause clearly for a developer: logic errors, prompt issues, tool wiring, state handling, etc.]

## PATCH SUGGESTION
[Provide precise, copy-and-paste code fixes. Include full functions or file patches. No placeholders.]

Focus strictly on fixing the observed issue. Do not invent unrelated features.
```

**User message:** JSON with `{ investigation: { id, trigger, runId, notes }, runMeta, runLogs, snapshots }`

**Output:** Free-form markdown split into `## DIAGNOSIS` and `## PATCH SUGGESTION` sections. Parsed by regex into `{ diagnosis: string, patchSuggestion: string }`.

---

### 5b. Conversation Quality Analyser

**File:** `src/evaluator/conversationQualityAnalysis.ts` → `runConversationQualityAnalysis()`  
**Model:** `process.env.EVAL_MODEL_ID ?? "gpt-4o-mini"`  
**Default model string:** `gpt-4o-mini`  
**Temperature:** `0.3`  
**Response format:** `{ type: "json_object" }` (JSON mode enforced)  
**When called:** On-demand when a conversation is flagged for quality review

**System prompt (verbatim):**

```
You are the Wyshbone Conversation Quality Evaluator. You analyze flagged assistant conversations to identify what went wrong in the chat behaviour (not tools) and provide actionable recommendations.

Your task is to:
1. Summarize the conversation and identify the main failure mode
2. Classify the failure into ONE of these categories:
   - prompt_issue: The assistant's system prompt or instructions are inadequate
   - decision_logic_issue: The assistant made poor decisions about what to do
   - missing_behaviour_test: A specific scenario lacks proper test coverage
   - missing_clarification_logic: The assistant should have asked for clarification but didn't
   - unclear_or_ambiguous_user_input: The user's input was genuinely unclear

3. Provide a developer brief with:
   - Root cause hypothesis
   - Minimal reproducible scenario (shortened transcript focused on the problem)
   - Suggested changes (prompt / routing / decision logic)
   - Whether a new behaviour test should exist and what it should assert

OUTPUT FORMAT:
You must respond with a valid JSON object with this exact structure:
{
  "failure_category": "one of the five categories above",
  "summary": "short human-readable summary of what went wrong",
  "repro_scenario": "minimal transcript snippet showing the problem",
  "suggested_prompt_changes": "free-text suggestions for prompt improvements (optional)",
  "suggested_behaviour_test": "description of a test, if applicable (optional)"
}
```

**User message:** JSON with `{ session_id, user_id, flagged_message_index, user_note, conversation_window, instruction }`

**Output schema:**

```json
{
  "failure_category": "prompt_issue" | "decision_logic_issue" | "missing_behaviour_test" |
                      "missing_clarification_logic" | "unclear_or_ambiguous_user_input",
  "summary":                   string,
  "repro_scenario":             string,
  "suggested_prompt_changes":   string (optional),
  "suggested_behaviour_test":   string (optional)
}
```

---

## Summary Table

| Judge | LLM? | Default Model | Env Override | Temperature | In Verdict Path? |
|---|---|---|---|---|---|
| Tower Verdict | No | — | — | — | Yes (deterministic) |
| Evidence Quality Judge | No | — | — | — | Yes (deterministic) |
| Semantic Evidence Judge | Yes (with fallbacks) | `gpt-4o` | `SEMANTIC_JUDGE_MODEL` | 0.1 | Yes — runs before Tower evaluates HAS_ATTRIBUTE constraints |
| Behaviour Judge | Yes (gated) | `gpt-4o` | `BEHAVIOUR_JUDGE_MODEL` | 0.15 | Yes — fires async after verdict; gated by `BEHAVIOUR_JUDGE_ENABLED=true` |
| Run Diagnosis | Yes | `gpt-4o-mini` | `EVAL_MODEL_ID` | 0.2 | No — investigation system only |
| Conversation Quality | Yes | `gpt-4o-mini` | `EVAL_MODEL_ID` | 0.3 | No — investigation system only |

---

*Source files: `src/evaluator/behaviourJudge.ts`, `src/evaluator/semanticEvidenceJudge.ts`, `src/evaluator/towerVerdict.ts`, `src/evaluator/evidenceQualityJudge.ts`, `src/evaluator/runDiagnosis.ts`, `src/evaluator/conversationQualityAnalysis.ts`, `server/routes-tower-verdict.ts`*
