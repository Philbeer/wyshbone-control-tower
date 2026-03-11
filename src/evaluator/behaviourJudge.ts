import { openai } from "../lib/openai";
import { db } from "../lib/db";
import { behaviourJudgeResults } from "../../shared/schema";
import type { SourceTier } from "./towerVerdict";

export type BehaviourOutcome = "PASS" | "HONEST_PARTIAL" | "BATCH_EXHAUSTED" | "CAPABILITY_FAIL" | "WRONG_DECISION";

export type QueryClass = "simple_discovery" | "name_match" | "website_evidence" | "relationship" | "clarify_required";

export type SimplifiedSourceTier = "first_party" | "third_party" | "snippet";

export interface LeadEvidence {
  lead_name: string;
  source_tier: SimplifiedSourceTier;
  source_url?: string;
  evidence_text?: string;
  verified: boolean;
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
}

export interface BehaviourJudgeResult {
  outcome: BehaviourOutcome;
  reason: string;
  confidence: number;
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
): QueryClass {
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
  if (goalLower.includes("website") && (goalLower.includes("mention") || goalLower.includes("evidence") || goalLower.includes("says"))) {
    return "website_evidence";
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

const BEHAVIOUR_JUDGE_SYSTEM_PROMPT = `You are the Behaviour Judge for Wyshbone. You receive the result of a completed agent run and must classify the agent's BEHAVIOUR into exactly one outcome.

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
      };
      if (le.source_url) entry.source_url = le.source_url;
      if (le.evidence_text) entry.evidence_text = le.evidence_text;
      return entry;
    });
  }

  return JSON.stringify(payload, null, 2);
}

function parseResponse(text: string): BehaviourJudgeResult | null {
  try {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    const parsed = JSON.parse(cleaned);
    if (!parsed.outcome || !VALID_OUTCOMES.has(parsed.outcome)) return null;
    if (typeof parsed.reason !== "string") return null;
    return {
      outcome: parsed.outcome as BehaviourOutcome,
      reason: parsed.reason,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
    };
  } catch {
    return null;
  }
}

export async function judgeBehaviour(input: BehaviourJudgeInput): Promise<BehaviourJudgeResult> {
  const model = process.env.BEHAVIOUR_JUDGE_MODEL ?? "gpt-4o";

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: BEHAVIOUR_JUDGE_SYSTEM_PROMPT },
      { role: "user", content: buildBehaviourJudgePrompt(input) },
    ],
    temperature: 0.15,
    max_tokens: 600,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    return { outcome: "CAPABILITY_FAIL", reason: "Behaviour judge returned empty response", confidence: 0 };
  }

  const result = parseResponse(text);
  if (!result) {
    return { outcome: "CAPABILITY_FAIL", reason: `Behaviour judge returned unparseable response: ${text.substring(0, 200)}`, confidence: 0 };
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
    });
  }

  for (const ae of attributeEvidence) {
    const key = ae.lead_place_id ? `pid:${ae.lead_place_id}` : `name:${ae.lead_name.toLowerCase()}`;
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
  if (process.env.BEHAVIOUR_JUDGE_ENABLED !== "true") return;

  judgeBehaviour(input)
    .then(async (result) => {
      try {
        await db.insert(behaviourJudgeResults).values({
          run_id: input.run_id,
          outcome: result.outcome,
          reason: result.reason,
          confidence: result.confidence,
          tower_verdict: input.tower_verdict,
          delivered_count: input.delivered_count,
          requested_count: input.requested_count,
          input_snapshot: input as any,
        });
        console.log(`[BEHAVIOUR_JUDGE] run_id=${input.run_id} outcome=${result.outcome} confidence=${result.confidence} query_class=${input.query_class}`);
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
