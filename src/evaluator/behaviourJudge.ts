import { openai } from "../lib/openai";
import { db } from "../lib/db";
import { behaviourJudgeResults, gtEnrichmentQueue } from "../../shared/schema";
import type { SourceTier } from "./towerVerdict";

export type BehaviourOutcome = "PASS" | "HONEST_PARTIAL" | "BATCH_EXHAUSTED" | "CAPABILITY_FAIL" | "WRONG_DECISION";

export type BehaviourVerdict = BehaviourOutcome;

export type QueryClass = "simple_discovery" | "name_match" | "website_evidence" | "relationship" | "clarify_required";

export type SimplifiedSourceTier = "first_party" | "third_party" | "snippet";

export interface LeadEvidence {
  lead_name: string;
  source_tier: SimplifiedSourceTier;
  source_url?: string;
  evidence_text?: string;
  verified: boolean;
  is_bot_blocked?: boolean;
}

export interface ConstraintVerdictDetail {
  type: string;
  field: string;
  value: string | number;
  hardness: "hard" | "soft";
  verdict: string;
  reason?: string;
  quote?: string;
  source_url?: string;
  source_tier?: SimplifiedSourceTier;
  matched_count?: number;
  total_leads?: number;
}

export interface BehaviourAssessment {
  verdict: BehaviourVerdict;
  reasoning: string;
  confidence: number;
}

export interface GroundTruthAssessment extends BehaviourAssessment {
  confirmed_matches?: string[];
  missed_positives?: string[];
  unconfirmed_tower_passed?: string[];
  unconfirmed_no_evidence?: string[];
}

export interface BehaviourJudgeInput {
  run_id: string;
  original_goal: string;
  strategy: string | null;
  verification_policy: string | null;
  delivered_count: number;
  requested_count: number | null;
  query_class: QueryClass;
  constraints: Array<{
    type: string;
    field: string;
    value: string | number;
    hardness: "hard" | "soft";
  }>;
  constraint_verdicts: ConstraintVerdictDetail[];
  leads_evidence: LeadEvidence[];
  tower_verdict: string;
  tower_gaps: string[];
  tower_stop_reason_code: string | null;
  agent_clarified: boolean;
  intent_narrative?: string | null;
  entity_exclusions?: string[] | null;
  key_discriminator?: string | null;
  true_universe?: Array<{ name: string; [key: string]: unknown }> | null;
  match_criteria?: string | null;
  ground_truth_notes?: string | null;
  gt_query_id?: string | null;
}

export interface BehaviourJudgeResult {
  mission_intent_assessment: BehaviourAssessment;
  ground_truth_assessment: GroundTruthAssessment | null;
  combined_verdict: BehaviourAssessment;
}

const VALID_OUTCOMES: Set<string> = new Set([
  "PASS", "HONEST_PARTIAL", "BATCH_EXHAUSTED", "CAPABILITY_FAIL", "WRONG_DECISION",
]);

const FICTIONAL_LOCATION_PATTERNS = [
  /\bnowhere\b/i, /\bfictional\b/i, /\bmade[- ]?up\b/i,
  /\bnarnia\b/i, /\bhogwarts\b/i, /\bgotham\b/i, /\bwakanda\b/i,
  /\bmiddle[- ]?earth\b/i, /\bwesteros\b/i,
];

export function inferQueryClass(
  goal: string,
  constraints: Array<{ type: string; field: string; value: string | number; hardness: "hard" | "soft"; evidence_requirement?: string }>,
  intentNarrative?: { key_discriminator?: string; entity_description?: string; findability?: string } | null,
): QueryClass {
  console.log('[QUERY_CLASS DEBUG] goal:', goal, '| constraints:', JSON.stringify(constraints.map(c => ({ type: c.type, field: c.field, value: c.value }))), '| key_discriminator:', intentNarrative?.key_discriminator ?? 'none');
  for (const c of constraints) {
    if (c.type === "NAME_CONTAINS" || c.type === "NAME_STARTS_WITH") return "name_match";
  }

  for (const c of constraints) {
    if (c.evidence_requirement === "website_text" || c.type === "HAS_ATTRIBUTE") {
      const field = c.field?.toLowerCase() ?? "";
      const value = String(c.value).toLowerCase();
      if (field.includes("website") || field.includes("page") || value.includes("website") || value.includes("mentions")) {
        return "website_evidence";
      }
    }
  }

  const goalLower = goal.toLowerCase();
  if (
    goalLower.includes("website") && (
      goalLower.includes("mention") ||
      goalLower.includes("evidence") ||
      goalLower.includes("says") ||
      goalLower.includes("on their website") ||
      goalLower.includes("from their website") ||
      goalLower.includes("their website") ||
      goalLower.includes("website lists") ||
      goalLower.includes("website shows")
    )
  ) {
    return "website_evidence";
  }

  if (intentNarrative?.key_discriminator) {
    const kd = intentNarrative.key_discriminator.toLowerCase();
    if (kd.includes("website") || kd.includes("page") || kd.includes("mention") || kd.includes("their site")) {
      return "website_evidence";
    }
  }
  if (intentNarrative?.entity_description) {
    const ed = intentNarrative.entity_description.toLowerCase();
    if (ed.includes("website") || ed.includes("mention") || ed.includes("their site")) {
      return "website_evidence";
    }
  }

  if (goalLower.includes("work with") || goalLower.includes("partner") || goalLower.includes("supplier") || goalLower.includes("relationship")) {
    return "relationship";
  }
  for (const c of constraints) {
    if (c.type === "HAS_ATTRIBUTE") {
      const val = String(c.value).toLowerCase();
      if (val.includes("partner") || val.includes("supplier") || val.includes("works with") || val.includes("relationship")) {
        return "relationship";
      }
    }
  }

  for (const pat of FICTIONAL_LOCATION_PATTERNS) {
    if (pat.test(goal)) return "clarify_required";
  }

  const locationConstraint = constraints.find((c) => c.type === "LOCATION");
  if (locationConstraint) {
    const loc = String(locationConstraint.value).toLowerCase();
    for (const pat of FICTIONAL_LOCATION_PATTERNS) {
      if (pat.test(loc)) return "clarify_required";
    }
  }

  return "simple_discovery";
}

export function mapSourceTier(tier: SourceTier | string | undefined): SimplifiedSourceTier {
  switch (tier) {
    case "first_party_website":
    case "first_party":
      return "first_party";
    case "directory_field":
    case "lead_field":
      return "third_party";
    case "search_snippet":
    case "external_source":
    case "unknown":
    default:
      return "snippet";
  }
}

const MAX_EVIDENCE_TEXT_LENGTH = 2000;

function truncateEvidence(text: string | undefined): string | undefined {
  if (!text) return undefined;
  if (text.length <= MAX_EVIDENCE_TEXT_LENGTH) return text;
  return text.substring(0, MAX_EVIDENCE_TEXT_LENGTH) + "… [truncated]";
}

const BEHAVIOUR_JUDGE_SYSTEM_PROMPT = `You are the Behaviour Judge for Wyshbone. You receive the result of a completed agent run and must produce THREE independent assessments.

You will receive: the user's original goal, the query class, the strategy used, how many leads were delivered vs requested, per-lead evidence with source tiers, full constraint verdicts with evidence quotes, Tower's verdict and gaps, and whether the agent clarified or ran directly. Optionally you may also receive ground truth data (true_universe, match_criteria, ground_truth_notes).

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
  - is_bot_blocked: Whether the agent attempted to fetch this lead's website but was actively blocked by bot protection (Cloudflare, hCaptcha, 403). The agent DID attempt the fetch.

intent_narrative: The structured intent decoded from the original goal. Includes:
  - entity_exclusions: Leads that were intentionally filtered out (e.g. "exclude Laura Thomas"). A lower delivered_count caused by these exclusions is CORRECT behaviour.
  - key_discriminator: The specific attribute that distinguishes a genuine match from a false positive for this query.

constraint_verdicts: Full per-constraint results including:
  - verdict: VERIFIED, PLAUSIBLE, UNSUPPORTED, CONTRADICTED, or NOT_APPLICABLE
  - reason: Why this verdict was given
  - quote: The evidence text supporting the verdict
  - source_tier: Where the evidence came from
  - matched_count / total_leads: How many leads matched this constraint

true_universe (optional): The known set of real-world entities that genuinely match the goal. Only present in ground-truth evaluation runs.
match_criteria (optional): The rules defining what counts as a valid match. Only present in ground-truth evaluation runs.
ground_truth_notes (optional): Contextual notes about the ground truth record.

## The five verdicts (used by all three assessments)

PASS
  Fully met the request / fully matches reality. No meaningful gaps.

HONEST_PARTIAL
  Performance was good but real-world supply is genuinely limited (mission) OR the agent found the real matches that exist but fewer than requested because that's all there are (ground truth).

BATCH_EXHAUSTED
  Performance was good within the search scope used, but more matching results exist in the world and a wider search would find them (mission) OR the agent found a subset of the true universe because its search window was too narrow (ground truth).

CAPABILITY_FAIL
  The agent missed findable things: bad queries, missed evidence, wrong constraint interpretation, failed verification, or — for ground truth — the agent delivered results that don't appear in the true universe or missed results that do.

WRONG_DECISION
  The agent made the wrong routing decision: ran when it should have clarified, or clarified when the goal was clear. Not applicable to ground_truth_assessment.

## Assessment 1 — mission_intent_assessment

Evaluate whether the agent EXECUTED CORRECTLY given the query. Consider:
- Was the routing decision right (run vs clarify)?
- Was the plan and strategy appropriate?
- Did the agent use correct search queries and correct verification depth?
- Did it interpret constraints correctly?
- Did it behave honestly when blocked?
- Did it terminate appropriately?

Bot-blocking rule: If 3 or more leads have is_bot_blocked: true on a website_evidence query, you MUST return HONEST_PARTIAL not CAPABILITY_FAIL — the agent executed correctly but was blocked by infrastructure outside its control. Only return CAPABILITY_FAIL if leads have snippet evidence AND is_bot_blocked is false or null, meaning the agent had an opportunity to fetch the website but did not.

Entity exclusions: A lower delivered_count caused by entity_exclusions is CORRECT behaviour — do not penalise the agent for it.

Key discriminator: Use this to assess whether the agent was distinguishing genuine matches from false positives.

Evidence tiers:
- first_party (business's own website) is strongest. VERIFIED with first_party = high confidence.
- third_party (directories, review sites) is good but may be outdated.
- snippet only is weak. If critical constraints rely only on snippets, lean toward CAPABILITY_FAIL.
- For website_evidence queries: if the agent only checked snippets but never visited the website, that is CAPABILITY_FAIL. A low count alone is NOT CAPABILITY_FAIL if the agent visited pages and Tower found no evidence.
- For relationship queries: look for concrete evidence of the relationship, not just co-mentions.

## Assessment 2 — ground_truth_assessment

Only produce this assessment when BOTH true_universe and match_criteria are present in the input. If either is absent, set ground_truth_assessment to null.

### Epistemological rule — the GT is not exhaustive
The true_universe was built from a finite set of searches and may have genuine gaps. Absence from true_universe does NOT confirm a false positive — you would need to actively re-verify that specific business to confirm. You CANNOT penalise the agent for finding real matches that happen to be missing from the GT list.

### Classify every delivered lead into exactly one category

Match leads against true_universe using case-insensitive fuzzy matching (allow common variations: "The" prefix, "&" vs "and", minor spelling differences):

- **confirmed_match**: Lead name matches an entry in true_universe. Agent found a known true positive. GOOD.
- **unconfirmed_tower_passed**: Lead is NOT in true_universe, but it was verified (verified=true OR source_tier=first_party in leads_evidence). Tower PASSED it with evidence. NEUTRAL — likely a GT gap. Do NOT penalise.
- **unconfirmed_no_evidence**: Lead is NOT in true_universe and was NOT verified / no first-party evidence. NEUTRAL — suspicious but cannot confirm as false positive without re-verification. Do NOT penalise.

Also identify:
- **missed_positive**: An entry in true_universe that the agent did NOT deliver at all. Agent missed a findable real positive. BAD — penalise this.

### Verdict — based ONLY on confirmed_matches vs missed_positives
Unconfirmed results MUST NOT influence the verdict in either direction. They are neutral pending GT enrichment.

- PASS: Agent delivered all true_universe entries (zero missed_positives), or confirmed_matches ≥ requested_count with no missed_positives.
- HONEST_PARTIAL: Agent found all genuinely findable true_universe matches but the true universe itself is smaller than requested, or some entries are inherently unfindable (e.g. bot-blocked, closed).
- BATCH_EXHAUSTED: Agent found a subset of true_universe; a broader search would plausibly have found the missed_positives.
- CAPABILITY_FAIL: Agent missed true_universe entries that were realistically findable with correct technique.
- Do NOT use WRONG_DECISION for ground_truth_assessment.
- Derive your verdict from the raw data only. No expected verdict is given to you.

## Assessment 3 — combined_verdict

Weigh both assessments and produce a single summary verdict. Rules:
- In a perfect run, combined_verdict is always PASS.
- Any degradation from either dimension pulls combined_verdict below PASS.
- If mission_intent_assessment is WRONG_DECISION, combined_verdict is WRONG_DECISION regardless of ground truth.
- If ground_truth_assessment is null, combined_verdict equals mission_intent_assessment.
- Otherwise take the worse of the two verdicts, using this severity order (worst first): WRONG_DECISION > CAPABILITY_FAIL > BATCH_EXHAUSTED > HONEST_PARTIAL > PASS.
- IMPORTANT: Unconfirmed GT results (unconfirmed_tower_passed, unconfirmed_no_evidence) MUST NOT influence combined_verdict. Only confirmed_matches vs missed_positives from ground_truth_assessment count toward the combined verdict.
- Write a brief reasoning that synthesises both dimensions.

## Key distinctions

HONEST_PARTIAL vs BATCH_EXHAUSTED:
  Both involve a shortfall with competent work. HONEST_PARTIAL = the world genuinely lacks results. BATCH_EXHAUSTED = results exist but the search window was too narrow. Ask: "Would a broader search plausibly find more?" If yes -> BATCH_EXHAUSTED. If no -> HONEST_PARTIAL.

BATCH_EXHAUSTED vs CAPABILITY_FAIL:
  BATCH_EXHAUSTED = technique was sound but scope was limited. CAPABILITY_FAIL = technique was flawed. Ask: "Was the approach correct within what it searched?" If yes -> BATCH_EXHAUSTED. If no -> CAPABILITY_FAIL.

CAPABILITY_FAIL vs WRONG_DECISION:
  CAPABILITY_FAIL = correct decision to run, poor execution. WRONG_DECISION = should not have run (or should have run but asked instead).

## Response format

Respond with valid JSON only. No markdown fences, no other text:
{
  "mission_intent_assessment": {
    "verdict": "PASS",
    "reasoning": "Brief explanation.",
    "confidence": 85
  },
  "ground_truth_assessment": {
    "verdict": "PASS",
    "reasoning": "Brief explanation referencing confirmed_matches and missed_positives only.",
    "confidence": 90,
    "confirmed_matches": ["Lead A", "Lead B"],
    "missed_positives": [],
    "unconfirmed_tower_passed": ["Lead C"],
    "unconfirmed_no_evidence": []
  },
  "combined_verdict": {
    "verdict": "PASS",
    "reasoning": "Brief synthesis of both dimensions.",
    "confidence": 87
  }
}

If ground truth data is not present, set ground_truth_assessment to null:
{
  "mission_intent_assessment": { "verdict": "PASS", "reasoning": "...", "confidence": 85 },
  "ground_truth_assessment": null,
  "combined_verdict": { "verdict": "PASS", "reasoning": "...", "confidence": 85 }
}`;

function buildBehaviourJudgePrompt(input: BehaviourJudgeInput): string {
  const payload: Record<string, unknown> = {
    original_goal: input.original_goal,
    query_class: input.query_class,
    strategy: input.strategy,
    verification_policy: input.verification_policy,
    delivered_count: input.delivered_count,
    requested_count: input.requested_count,
    constraints: input.constraints,
    constraint_verdicts: input.constraint_verdicts,
    tower_verdict: input.tower_verdict,
    tower_gaps: input.tower_gaps,
    tower_stop_reason_code: input.tower_stop_reason_code,
    agent_clarified: input.agent_clarified,
  };

  if (input.leads_evidence.length > 0) {
    payload.leads_evidence = input.leads_evidence.map((le) => {
      const entry: Record<string, unknown> = {
        lead_name: le.lead_name,
        source_tier: le.source_tier,
        verified: le.verified,
        is_bot_blocked: le.is_bot_blocked === true,
      };
      if (le.source_url) entry.source_url = le.source_url;
      if (le.evidence_text) entry.evidence_text = le.evidence_text;
      return entry;
    });
  }

  if (input.entity_exclusions && input.entity_exclusions.length > 0) {
    payload.entity_exclusions = input.entity_exclusions;
  }
  if (input.key_discriminator) {
    payload.key_discriminator = input.key_discriminator;
  }

  if (input.true_universe && input.true_universe.length > 0) {
    payload.true_universe = input.true_universe;
  }
  if (input.match_criteria) {
    payload.match_criteria = input.match_criteria;
  }
  if (input.ground_truth_notes) {
    payload.ground_truth_notes = input.ground_truth_notes;
  }

  return JSON.stringify(payload, null, 2);
}

function parseAssessment(raw: unknown): BehaviourAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.verdict || !VALID_OUTCOMES.has(obj.verdict as string)) return null;
  if (typeof obj.reasoning !== "string") return null;
  return {
    verdict: obj.verdict as BehaviourVerdict,
    reasoning: obj.reasoning,
    confidence: typeof obj.confidence === "number" ? obj.confidence : 50,
  };
}

function parseGroundTruthAssessment(raw: unknown): GroundTruthAssessment | null {
  const base = parseAssessment(raw);
  if (!base) return null;
  const obj = raw as Record<string, unknown>;
  const result: GroundTruthAssessment = { ...base };
  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  result.confirmed_matches = toStringArray(obj.confirmed_matches);
  result.missed_positives = toStringArray(obj.missed_positives);
  result.unconfirmed_tower_passed = toStringArray(obj.unconfirmed_tower_passed);
  result.unconfirmed_no_evidence = toStringArray(obj.unconfirmed_no_evidence);
  return result;
}

function parseResponse(text: string): BehaviourJudgeResult | null {
  try {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    const parsed = JSON.parse(cleaned);

    const mia = parseAssessment(parsed.mission_intent_assessment);
    if (!mia) return null;

    const gta = parsed.ground_truth_assessment === null || parsed.ground_truth_assessment === undefined
      ? null
      : parseGroundTruthAssessment(parsed.ground_truth_assessment);

    const cv = parseAssessment(parsed.combined_verdict);
    if (!cv) return null;

    return {
      mission_intent_assessment: mia,
      ground_truth_assessment: gta,
      combined_verdict: cv,
    };
  } catch {
    return null;
  }
}

const PARSE_FAILURE_RESULT: BehaviourJudgeResult = {
  combined_verdict: { verdict: "CAPABILITY_FAIL", reasoning: "parse error", confidence: 0 },
  mission_intent_assessment: { verdict: "CAPABILITY_FAIL", reasoning: "parse error", confidence: 0 },
  ground_truth_assessment: null,
};

export async function judgeBehaviour(input: BehaviourJudgeInput): Promise<BehaviourJudgeResult> {
  const model = process.env.BEHAVIOUR_JUDGE_MODEL ?? "gpt-4o";

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: BEHAVIOUR_JUDGE_SYSTEM_PROMPT },
      { role: "user", content: buildBehaviourJudgePrompt(input) },
    ],
    temperature: 0.15,
    max_tokens: 1800,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    return {
      ...PARSE_FAILURE_RESULT,
      combined_verdict: { verdict: "CAPABILITY_FAIL", reasoning: "Behaviour judge returned empty response", confidence: 0 },
      mission_intent_assessment: { verdict: "CAPABILITY_FAIL", reasoning: "Behaviour judge returned empty response", confidence: 0 },
    };
  }

  const result = parseResponse(text);
  if (!result) {
    return {
      ...PARSE_FAILURE_RESULT,
      combined_verdict: { verdict: "CAPABILITY_FAIL", reasoning: `Behaviour judge returned unparseable response: ${text.substring(0, 200)}`, confidence: 0 },
      mission_intent_assessment: { verdict: "CAPABILITY_FAIL", reasoning: `Behaviour judge returned unparseable response: ${text.substring(0, 200)}`, confidence: 0 },
    };
  }

  return result;
}

function leadKey(lead: { name: string; place_id?: string; lead_place_id?: string }): string {
  const pid = lead.place_id ?? lead.lead_place_id;
  if (pid) return `pid:${pid}`;
  return `name:${lead.name.toLowerCase()}`;
}

export function buildLeadsEvidence(
  leads: Array<{ name: string; verified?: boolean; evidence?: unknown; source_url?: string; page_text?: string; snippet?: string; place_id?: string; [key: string]: unknown }>,
  deliveredLeads: Array<{ name: string; verified?: boolean; evidence?: unknown; source_url?: string; page_text?: string; snippet?: string; place_id?: string; [key: string]: unknown }> | undefined,
  attributeEvidence: Array<{ lead_name: string; lead_place_id?: string; source_url?: string; quote?: string; extracted_quotes?: string[]; source_tier?: string; verdict: string; semantic_verdict?: string }>,
): LeadEvidence[] {
  const evidenceByLead = new Map<string, LeadEvidence>();

  const resolvedLeads = leads.length > 0 ? leads : (deliveredLeads ?? []);

  for (const lead of resolvedLeads) {
    const key = leadKey(lead);
    const sourceTier = mapSourceTier(lead.source_tier as SourceTier | undefined);
    const evidenceText = lead.page_text ?? lead.snippet ??
      (typeof lead.evidence === "string" ? lead.evidence : undefined);

    evidenceByLead.set(key, {
      lead_name: lead.name,
      source_tier: sourceTier,
      source_url: lead.source_url,
      evidence_text: truncateEvidence(evidenceText),
      verified: lead.verified === true,
      is_bot_blocked: (lead as any).is_bot_blocked === true || (lead as any).isBotBlocked === true || (lead as any).verification_status === 'unreachable',
    });
  }

  for (const ae of attributeEvidence) {
    const key = ae.lead_place_id
      ? evidenceByLead.has(`pid:${ae.lead_place_id}`) ? `pid:${ae.lead_place_id}` : `name:${ae.lead_name.toLowerCase()}`
      : `name:${ae.lead_name.toLowerCase()}`;
    const existing = evidenceByLead.get(key);
    const tier = mapSourceTier(ae.source_tier);
    const aeText = ae.quote ?? ae.extracted_quotes?.join("\n---\n");
    const effectiveVerdict = ae.semantic_verdict ?? ae.verdict;

    if (existing) {
      if (tier === "first_party" && existing.source_tier !== "first_party") {
        existing.source_tier = tier;
      }
      if (!existing.source_url && ae.source_url) {
        existing.source_url = ae.source_url;
      }
      if (!existing.evidence_text && aeText) {
        existing.evidence_text = truncateEvidence(aeText);
      } else if (existing.evidence_text && aeText) {
        existing.evidence_text = truncateEvidence(existing.evidence_text + "\n---\n" + aeText);
      }
      if (effectiveVerdict === "no" || effectiveVerdict === "contradicted") {
        existing.verified = false;
      }
      if (!existing.is_bot_blocked && (ae as any).is_bot_blocked) existing.is_bot_blocked = true;
    } else {
      evidenceByLead.set(key, {
        lead_name: ae.lead_name,
        source_tier: tier,
        source_url: ae.source_url,
        evidence_text: truncateEvidence(aeText),
        verified: effectiveVerdict === "yes" || effectiveVerdict === "verified",
      });
    }
  }

  return Array.from(evidenceByLead.values());
}

export function fireBehaviourJudge(input: BehaviourJudgeInput): void {
  console.log(`[BEHAVIOUR_JUDGE] fireBehaviourJudge called run_id=${input.run_id} ENABLED=${process.env.BEHAVIOUR_JUDGE_ENABLED}`);
  if (process.env.BEHAVIOUR_JUDGE_ENABLED !== "true") {
    console.log(`[BEHAVIOUR_JUDGE] skipped — BEHAVIOUR_JUDGE_ENABLED is not "true" (value=${JSON.stringify(process.env.BEHAVIOUR_JUDGE_ENABLED)})`);
    return;
  }
  console.log(`[BEHAVIOUR_JUDGE] gate passed — calling LLM for run_id=${input.run_id} query_class=${input.query_class}`);

  judgeBehaviour(input)
    .then(async (result) => {
      try {
        await db.insert(behaviourJudgeResults).values({
          run_id: input.run_id,
          outcome: result.combined_verdict.verdict,
          reason: result.combined_verdict.reasoning,
          confidence: result.combined_verdict.confidence,
          tower_verdict: input.tower_verdict,
          delivered_count: input.delivered_count,
          requested_count: input.requested_count,
          input_snapshot: input as any,
          mission_intent_assessment: result.mission_intent_assessment as any,
          ground_truth_assessment: result.ground_truth_assessment as any ?? null,
        });
        console.log(`[BEHAVIOUR_JUDGE] run_id=${input.run_id} combined=${result.combined_verdict.verdict}(${result.combined_verdict.confidence}) mission=${result.mission_intent_assessment.verdict}(${result.mission_intent_assessment.confidence}) gt=${result.ground_truth_assessment?.verdict ?? "null"} query_class=${input.query_class}`);

        const gta = result.ground_truth_assessment;
        if (gta && input.gt_query_id) {
          const unconfirmed: Array<{ name: string; towerVerdict: string | null }> = [
            ...(gta.unconfirmed_tower_passed ?? []).map((name) => ({ name, towerVerdict: "PASS" })),
            ...(gta.unconfirmed_no_evidence ?? []).map((name) => ({ name, towerVerdict: null })),
          ];
          if (unconfirmed.length > 0) {
            console.log(`[GT-ENRICHMENT] ${unconfirmed.length} unconfirmed candidate(s) for query_id=${input.gt_query_id} run_id=${input.run_id}`);
            for (const { name, towerVerdict } of unconfirmed) {
              const le = input.leads_evidence.find((l) => l.lead_name.toLowerCase() === name.toLowerCase());
              console.log(`[GT-ENRICHMENT] queuing name="${name}" tower_verdict=${towerVerdict ?? "null"}`);
              await db.insert(gtEnrichmentQueue).values({
                query_id: input.gt_query_id,
                candidate_name: name,
                constraints_to_verify: input.match_criteria ?? null,
                tower_verdict: towerVerdict,
                tower_evidence: le?.evidence_text ?? null,
                status: "pending",
                run_id: input.run_id,
              });
            }
            console.log(`[GT-ENRICHMENT] queued ${unconfirmed.length} candidate(s) for GT review`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[BEHAVIOUR_JUDGE] persist failed run_id=${input.run_id}: ${msg}`);
      }
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[BEHAVIOUR_JUDGE] LLM call failed run_id=${input.run_id}: ${msg}`);
    });
}
