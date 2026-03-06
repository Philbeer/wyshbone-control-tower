import { openai } from "../lib/openai";
import type { AttributeEvidenceArtefact, Constraint, CvlConstraintStatus } from "./towerVerdict";

export interface SemanticJudgement {
  satisfies: CvlConstraintStatus;
  strength: "direct" | "indirect" | "weak" | "none";
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are the Wyshbone Evidence Judge. You evaluate whether a piece of evidence (a quote, snippet, or text from a website) supports a specific attribute constraint for a business.

You receive:
- The user's original goal
- The constraint being checked (e.g. "serves vegan food")
- The business name
- The evidence text (quote/snippet from a website or source)

Your job is to judge whether the evidence semantically supports the constraint. Consider synonyms, related concepts, and implied meaning. For example:
- "plant-based menu" supports "vegan food"
- "we offer vegan options" supports "vegan food"  
- "fully vegan brunch" supports "vegan food"
- "vegetarian menu" only weakly supports "vegan food" (vegetarian ≠ vegan)
- "great coffee selection" does not support "vegan food"

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

function buildUserPrompt(
  originalGoal: string,
  constraint: Constraint,
  leadName: string,
  evidenceQuote: string | null | undefined,
  sourceUrl: string | null | undefined
): string {
  return JSON.stringify({
    original_goal: originalGoal,
    constraint: {
      type: constraint.type,
      field: constraint.field,
      value: constraint.value,
      hardness: constraint.hardness,
    },
    business_name: leadName,
    evidence_quote: evidenceQuote ?? null,
    source_url: sourceUrl ?? null,
  }, null, 2);
}

export async function judgeEvidenceSemantically(
  originalGoal: string,
  constraint: Constraint,
  leadName: string,
  evidenceQuote: string | null | undefined,
  sourceUrl: string | null | undefined
): Promise<SemanticJudgement> {
  const fallback: SemanticJudgement = {
    satisfies: "unknown",
    strength: "none",
    confidence: 0,
    reasoning: "Semantic judge could not evaluate — falling back to upstream verdict.",
  };

  if (!evidenceQuote || evidenceQuote.trim().length === 0) {
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
        { role: "user", content: buildUserPrompt(originalGoal, constraint, leadName, evidenceQuote, sourceUrl) },
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
    if (!ev.quote || ev.quote.trim().length === 0) continue;

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
      promise: judgeEvidenceSemantically(originalGoal, matchingConstraint, ev.lead_name, ev.quote, ev.source_url),
      constraint: matchingConstraint,
    });
  }

  if (promises.length === 0) return evidence;

  if (SEMANTIC_TRACE) {
    console.log(`[TOWER][SEMANTIC] Running semantic judgement on ${promises.length} evidence item(s) for goal="${originalGoal}"`);
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
