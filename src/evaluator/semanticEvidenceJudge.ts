import { openai } from "../lib/openai";
import type { AttributeEvidenceArtefact, Constraint, CvlConstraintStatus } from "./towerVerdict";

export interface SemanticJudgement {
  satisfies: CvlConstraintStatus;
  strength: "direct" | "indirect" | "weak" | "none";
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are the Wyshbone Evidence Judge. You evaluate whether evidence (quotes, snippets, or text extracted from a website) supports a specific attribute constraint for a business.

You receive:
- The user's original goal
- The constraint being checked (e.g. "serves vegan food")
- The raw constraint and attribute labels for context
- The business name
- One or more evidence snippets extracted from a web page
- The page title and source URL for context

Your job is to judge whether the evidence semantically supports the constraint. Consider synonyms, related concepts, and implied meaning. For example:
- "plant-based menu" supports "vegan food"
- "we offer vegan options" supports "vegan food"
- "fully vegan brunch" supports "vegan food"
- "Had a vegan brunch in Manchester at Pot Kettle Black" supports "vegan food"
- "vegetarian menu" only weakly supports "vegan food" (vegetarian ≠ vegan)
- "great coffee selection" does not support "vegan food"

When multiple snippets are provided, evaluate them together. If any snippet provides strong support, that is sufficient.

You MUST respond with valid JSON in this exact structure:
{
  "satisfies": "yes" | "no" | "unknown",
  "strength": "direct" | "indirect" | "weak" | "none",
  "confidence": 0.0 to 1.0,
  "reasoning": "1-2 sentence explanation"
}

Strength definitions:
- "direct": evidence explicitly states the attribute (e.g. "vegan menu available")
- "indirect": evidence strongly implies the attribute (e.g. "plant-based options" for vegan)
- "weak": evidence has some relevance but is not conclusive (e.g. "vegetarian" for vegan)
- "none": evidence does not support the attribute at all

Rules:
- Be accurate but not overly strict. Real-world evidence is often informal.
- If evidence is empty, null, or clearly irrelevant, return satisfies: "unknown", strength: "none".
- Confidence should reflect how certain you are. Direct quotes = high confidence. Indirect inference = lower.
- Keep reasoning concise.`;

interface SemanticJudgeInput {
  originalGoal: string;
  constraint: Constraint;
  leadName: string;
  evidenceQuote: string | null | undefined;
  extractedQuotes: string[] | null | undefined;
  sourceUrl: string | null | undefined;
  pageTitle: string | null | undefined;
  constraintRaw: string | null | undefined;
  attributeRaw: string | null | undefined;
}

function buildUserPrompt(input: SemanticJudgeInput): string {
  const evidenceSnippets: string[] = [];

  if (input.extractedQuotes && input.extractedQuotes.length > 0) {
    for (const q of input.extractedQuotes) {
      if (typeof q === "string" && q.trim().length > 0) {
        evidenceSnippets.push(q.trim());
      }
    }
  }

  if (evidenceSnippets.length === 0 && input.evidenceQuote && input.evidenceQuote.trim().length > 0) {
    evidenceSnippets.push(input.evidenceQuote.trim());
  }

  return JSON.stringify({
    original_goal: input.originalGoal,
    constraint: {
      type: input.constraint.type,
      field: input.constraint.field,
      value: input.constraint.value,
      hardness: input.constraint.hardness,
    },
    constraint_raw: input.constraintRaw ?? null,
    attribute_raw: input.attributeRaw ?? null,
    business_name: input.leadName,
    evidence_snippets: evidenceSnippets.length > 0 ? evidenceSnippets : null,
    page_title: input.pageTitle ?? null,
    source_url: input.sourceUrl ?? null,
  }, null, 2);
}

function hasAnyEvidence(input: SemanticJudgeInput): boolean {
  if (input.extractedQuotes && input.extractedQuotes.some(q => typeof q === "string" && q.trim().length > 0)) {
    return true;
  }
  if (input.evidenceQuote && input.evidenceQuote.trim().length > 0) {
    return true;
  }
  return false;
}

export async function judgeEvidenceSemantically(
  originalGoal: string,
  constraint: Constraint,
  leadName: string,
  evidenceQuote: string | null | undefined,
  sourceUrl: string | null | undefined,
  extractedQuotes?: string[] | null,
  pageTitle?: string | null,
  constraintRaw?: string | null,
  attributeRaw?: string | null
): Promise<SemanticJudgement> {
  const fallback: SemanticJudgement = {
    satisfies: "unknown",
    strength: "none",
    confidence: 0,
    reasoning: "Semantic judge could not evaluate — falling back to upstream verdict.",
  };

  const input: SemanticJudgeInput = {
    originalGoal,
    constraint,
    leadName,
    evidenceQuote,
    extractedQuotes: extractedQuotes ?? null,
    sourceUrl,
    pageTitle: pageTitle ?? null,
    constraintRaw: constraintRaw ?? null,
    attributeRaw: attributeRaw ?? null,
  };

  if (!hasAnyEvidence(input)) {
    return {
      satisfies: "unknown",
      strength: "none",
      confidence: 0,
      reasoning: "No evidence text provided to evaluate.",
    };
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "placeholder-key-not-set") {
    console.warn("[TOWER][SEMANTIC] OPENAI_API_KEY not set — skipping semantic evidence judgement");
    return fallback;
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.SEMANTIC_JUDGE_MODEL ?? process.env.EVAL_MODEL_ID ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      console.warn("[TOWER][SEMANTIC] Empty response from LLM");
      return fallback;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[TOWER][SEMANTIC] Could not extract JSON from LLM response");
      return fallback;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const validSatisfies = ["yes", "no", "unknown"];
    const validStrengths = ["direct", "indirect", "weak", "none"];

    const satisfies: CvlConstraintStatus = validSatisfies.includes(parsed.satisfies) ? parsed.satisfies : "unknown";
    const strength = validStrengths.includes(parsed.strength) ? parsed.strength as SemanticJudgement["strength"] : "none";
    const confidence = typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0.5;
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.substring(0, 500) : "No reasoning provided.";

    return { satisfies, strength, confidence, reasoning };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TOWER][SEMANTIC] LLM call failed: ${errMsg}`);
    return fallback;
  }
}

export async function enrichAttributeEvidence(
  evidence: AttributeEvidenceArtefact[],
  originalGoal: string,
  constraints: Constraint[]
): Promise<AttributeEvidenceArtefact[]> {
  if (!evidence || evidence.length === 0) return evidence;

  const hasAttributeConstraints = constraints.filter(c => c.type === "HAS_ATTRIBUTE");
  if (hasAttributeConstraints.length === 0) return evidence;

  const SEMANTIC_TRACE = process.env.DEBUG_TOWER_SEMANTIC_TRACE === "true";
  const enriched = [...evidence];
  const promises: Array<{ index: number; promise: Promise<SemanticJudgement>; constraint: Constraint }> = [];

  for (let i = 0; i < enriched.length; i++) {
    const ev = enriched[i];

    const hasExtractedQuotes = ev.extracted_quotes && ev.extracted_quotes.some(q => typeof q === "string" && q.trim().length > 0);
    const hasQuote = ev.quote && ev.quote.trim().length > 0;
    if (!hasExtractedQuotes && !hasQuote) continue;

    const normEvAttr = normalizeForMatch(ev.attribute_key ?? ev.attribute);
    if (!normEvAttr) continue;

    const matchingConstraint = hasAttributeConstraints.find(c => {
      const normConstraint = normalizeForMatch(String(c.value));
      if (!normConstraint) return false;
      return normConstraint === normEvAttr || normConstraint.includes(normEvAttr) || normEvAttr.includes(normConstraint);
    });

    if (!matchingConstraint) continue;

    promises.push({
      index: i,
      promise: judgeEvidenceSemantically(
        originalGoal,
        matchingConstraint,
        ev.lead_name,
        ev.quote,
        ev.source_url,
        ev.extracted_quotes,
        ev.page_title,
        ev.constraint_raw,
        ev.attribute_raw
      ),
      constraint: matchingConstraint,
    });
  }

  if (promises.length === 0) return evidence;

  if (SEMANTIC_TRACE) {
    console.log(`[TOWER][SEMANTIC] Running semantic judgement on ${promises.length} evidence item(s) for goal="${originalGoal}"`);
    for (const p of promises) {
      const ev = enriched[p.index];
      const quoteCount = ev.extracted_quotes?.length ?? 0;
      console.log(
        `[TOWER][SEMANTIC] queued: lead="${ev.lead_name}" attr="${ev.attribute}" ` +
        `extracted_quotes=${quoteCount} has_quote=${!!ev.quote} page_title="${ev.page_title ?? "none"}"`
      );
    }
  }

  const results = await Promise.allSettled(promises.map(p => p.promise));

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const { index } = promises[i];

    if (result.status === "fulfilled") {
      const judgement = result.value;
      const ev = enriched[index];

      ev.semantic_verdict = judgement.satisfies;
      ev.semantic_strength = judgement.strength;
      ev.semantic_confidence = judgement.confidence;
      ev.semantic_reasoning = judgement.reasoning;

      if (SEMANTIC_TRACE) {
        console.log(
          `[TOWER][SEMANTIC] lead="${ev.lead_name}" attr="${ev.attribute}" ` +
          `upstream_verdict=${ev.verdict} semantic_verdict=${judgement.satisfies} ` +
          `strength=${judgement.strength} confidence=${judgement.confidence} ` +
          `reasoning="${judgement.reasoning.substring(0, 120)}"`
        );
      }
    } else {
      if (SEMANTIC_TRACE) {
        console.warn(`[TOWER][SEMANTIC] Failed for index=${index}: ${result.reason}`);
      }
    }
  }

  return enriched;
}

function normalizeForMatch(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  return raw
    .toLowerCase()
    .trim()
    .replace(/^c_attr_/, "")
    .replace(/[\s\-]+/g, "_")
    .replace(/_{2,}/g, "_");
}
