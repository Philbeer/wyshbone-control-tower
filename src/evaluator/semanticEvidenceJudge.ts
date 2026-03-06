import { openai } from "../lib/openai";
import type { AttributeEvidenceArtefact, Constraint, CvlConstraintStatus } from "./towerVerdict";

export type SemanticStatus = "verified" | "weak_match" | "no_evidence" | "insufficient_evidence";
export type SemanticStrength = "strong" | "indirect" | "weak" | "none";

export interface SemanticJudgement {
  satisfies: CvlConstraintStatus;
  status: SemanticStatus;
  strength: SemanticStrength;
  confidence: number;
  reasoning: string;
  supporting_quotes: string[];
  judge_mode?: "llm" | "keyword_fallback";
}

const SYSTEM_PROMPT = `You are Tower, the judgement layer for Wyshbone.

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
status = "no_evidence"`;

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
    original_user_goal: input.originalGoal,
    lead_name: input.leadName,
    constraint_to_check: {
      type: input.constraint.type,
      field: input.constraint.field,
      value: input.constraint.value,
      hardness: input.constraint.hardness,
    },
    constraint_raw: input.constraintRaw ?? null,
    attribute_raw: input.attributeRaw ?? null,
    source_url: input.sourceUrl ?? null,
    page_title: input.pageTitle ?? null,
    evidence_text: evidenceSnippets.length > 0 ? evidenceSnippets : null,
  }, null, 2);
}

function collectEvidenceTexts(input: SemanticJudgeInput): string[] {
  const texts: string[] = [];
  if (input.extractedQuotes) {
    for (const q of input.extractedQuotes) {
      if (typeof q === "string" && q.trim().length > 0) {
        texts.push(q.trim());
      }
    }
  }
  if (input.evidenceQuote && input.evidenceQuote.trim().length > 0) {
    texts.push(input.evidenceQuote.trim());
  }
  return texts;
}

function hasAnyEvidence(input: SemanticJudgeInput): boolean {
  return collectEvidenceTexts(input).length > 0;
}

function tokenizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function keywordFallbackJudge(input: SemanticJudgeInput): SemanticJudgement {
  const constraintValue = String(input.constraint.value ?? "").toLowerCase().trim();
  if (!constraintValue) {
    return {
      satisfies: "unknown",
      status: "insufficient_evidence",
      strength: "none",
      confidence: 0,
      reasoning: "No constraint value to match against.",
      supporting_quotes: [],
      judge_mode: "keyword_fallback",
    };
  }

  const constraintTokens = tokenizeForMatch(constraintValue);
  if (constraintTokens.length === 0) {
    return {
      satisfies: "unknown",
      status: "insufficient_evidence",
      strength: "none",
      confidence: 0,
      reasoning: "Constraint value produced no matchable tokens.",
      supporting_quotes: [],
      judge_mode: "keyword_fallback",
    };
  }

  const evidenceTexts = collectEvidenceTexts(input);
  const pageTitle = input.pageTitle?.trim() ?? "";

  const allTextsToSearch = [...evidenceTexts];
  if (pageTitle.length > 0) {
    allTextsToSearch.push(pageTitle);
  }

  const matchedSnippets: string[] = [];
  let bestTokenOverlap = 0;
  let titleMatch = false;

  for (const text of allTextsToSearch) {
    const textLower = text.toLowerCase();
    const isTitle = text === pageTitle;

    if (textLower.includes(constraintValue)) {
      if (isTitle) titleMatch = true;
      matchedSnippets.push(text.substring(0, 200));
      bestTokenOverlap = constraintTokens.length;
      continue;
    }

    const textTokens = tokenizeForMatch(text);
    let overlap = 0;
    for (const ct of constraintTokens) {
      if (textTokens.some(tt => tt.includes(ct) || ct.includes(tt))) {
        overlap++;
      }
    }

    if (overlap > 0) {
      const ratio = overlap / constraintTokens.length;
      if (ratio >= 0.5) {
        if (isTitle) titleMatch = true;
        matchedSnippets.push(text.substring(0, 200));
        if (overlap > bestTokenOverlap) bestTokenOverlap = overlap;
      }
    }
  }

  if (matchedSnippets.length === 0) {
    return {
      satisfies: "unknown",
      status: "no_evidence",
      strength: "none",
      confidence: 0.3,
      reasoning: `Keyword fallback: no tokens from constraint "${constraintValue}" found in evidence text.`,
      supporting_quotes: [],
      judge_mode: "keyword_fallback",
    };
  }

  const tokenRatio = bestTokenOverlap / constraintTokens.length;
  const uniqueSnippets = [...new Set(matchedSnippets)].slice(0, 3);

  if (tokenRatio >= 1.0 || (tokenRatio >= 0.8 && titleMatch)) {
    return {
      satisfies: "yes",
      status: "weak_match",
      strength: "indirect",
      confidence: titleMatch ? 0.7 : 0.6,
      reasoning: `Keyword fallback: constraint "${constraintValue}" found in evidence text${titleMatch ? " and page title" : ""}. LLM unavailable for full semantic check.`,
      supporting_quotes: uniqueSnippets,
      judge_mode: "keyword_fallback",
    };
  }

  if (tokenRatio >= 0.5) {
    return {
      satisfies: "yes",
      status: "weak_match",
      strength: "weak",
      confidence: titleMatch ? 0.55 : 0.4,
      reasoning: `Keyword fallback: partial keyword match (${Math.round(tokenRatio * 100)}% token overlap) for "${constraintValue}"${titleMatch ? ", page title also matches" : ""}. LLM unavailable for full semantic check.`,
      supporting_quotes: uniqueSnippets,
      judge_mode: "keyword_fallback",
    };
  }

  return {
    satisfies: "unknown",
    status: "no_evidence",
    strength: "none",
    confidence: 0.2,
    reasoning: `Keyword fallback: insufficient keyword overlap for "${constraintValue}" in evidence.`,
    supporting_quotes: [],
    judge_mode: "keyword_fallback",
  };
}

function mapLlmResponseToJudgement(parsed: any): SemanticJudgement {
  const validStatuses: SemanticStatus[] = ["verified", "weak_match", "no_evidence", "insufficient_evidence"];
  const validStrengths: SemanticStrength[] = ["strong", "indirect", "weak", "none"];

  const status: SemanticStatus = validStatuses.includes(parsed.status) ? parsed.status : "insufficient_evidence";

  let strength: SemanticStrength;
  if (parsed.strength === "direct") {
    strength = "strong";
  } else if (validStrengths.includes(parsed.strength)) {
    strength = parsed.strength;
  } else {
    strength = "none";
  }

  const confidence = typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
    ? parsed.confidence
    : 0.5;

  const reasonText = parsed.reason ?? parsed.reasoning;
  const reasoning = typeof reasonText === "string" ? reasonText.substring(0, 500) : "No reasoning provided.";

  let satisfies: CvlConstraintStatus;
  if (typeof parsed.satisfies === "boolean") {
    satisfies = parsed.satisfies ? "yes" : "no";
  } else if (typeof parsed.satisfies === "string" && ["yes", "no", "unknown"].includes(parsed.satisfies)) {
    satisfies = parsed.satisfies as CvlConstraintStatus;
  } else if (status === "verified") {
    satisfies = "yes";
  } else if (status === "no_evidence") {
    satisfies = "no";
  } else {
    satisfies = "unknown";
  }

  let supporting_quotes: string[] = [];
  if (Array.isArray(parsed.supporting_quotes)) {
    supporting_quotes = parsed.supporting_quotes
      .filter((q: unknown) => typeof q === "string" && (q as string).trim().length > 0)
      .map((q: string) => q.trim().substring(0, 500))
      .slice(0, 3);
  }

  return { satisfies, status, strength, confidence, reasoning, supporting_quotes, judge_mode: "llm" };
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

  const TRACE = process.env.DEBUG_TOWER_SEMANTIC_TRACE === "true";

  if (!hasAnyEvidence(input)) {
    if (TRACE) {
      console.log(`[TOWER][SEMANTIC] No evidence text for lead="${leadName}" constraint="${constraint.value}" — returning insufficient_evidence`);
    }
    return {
      satisfies: "unknown",
      status: "insufficient_evidence",
      strength: "none",
      confidence: 0,
      reasoning: "No evidence text provided to evaluate.",
      supporting_quotes: [],
    };
  }

  if (TRACE) {
    const texts = collectEvidenceTexts(input);
    console.log(
      `[TOWER][SEMANTIC] Judging lead="${leadName}" constraint="${constraint.value}" ` +
      `evidence_count=${texts.length} page_title="${pageTitle ?? "none"}" ` +
      `has_api_key=${!!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "placeholder-key-not-set"}`
    );
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "placeholder-key-not-set") {
    console.warn("[TOWER][SEMANTIC] OPENAI_API_KEY not set — using keyword fallback judge");
    const kwResult = keywordFallbackJudge(input);
    if (TRACE) {
      console.log(
        `[TOWER][SEMANTIC] keyword_fallback result: lead="${leadName}" satisfies=${kwResult.satisfies} ` +
        `status=${kwResult.status} strength=${kwResult.strength} confidence=${kwResult.confidence} ` +
        `quotes=${JSON.stringify(kwResult.supporting_quotes)} reason="${kwResult.reasoning.substring(0, 120)}"`
      );
    }
    return kwResult;
  }

  try {
    const promptPayload = buildUserPrompt(input);

    if (TRACE) {
      console.log(`[TOWER][SEMANTIC] LLM prompt for lead="${leadName}": ${promptPayload.substring(0, 500)}`);
    }

    const response = await openai.chat.completions.create({
      model: process.env.SEMANTIC_JUDGE_MODEL ?? process.env.EVAL_MODEL_ID ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: promptPayload },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });

    const text = response.choices[0]?.message?.content;

    if (TRACE) {
      console.log(`[TOWER][SEMANTIC] LLM raw response for lead="${leadName}": ${(text ?? "NULL").substring(0, 500)}`);
    }

    if (!text) {
      console.warn("[TOWER][SEMANTIC] Empty response from LLM — using keyword fallback judge");
      return keywordFallbackJudge(input);
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[TOWER][SEMANTIC] Could not extract JSON from LLM response — using keyword fallback. Raw: ${text.substring(0, 200)}`);
      return keywordFallbackJudge(input);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = mapLlmResponseToJudgement(parsed);

    if (TRACE) {
      console.log(
        `[TOWER][SEMANTIC] LLM result: lead="${leadName}" satisfies=${result.satisfies} ` +
        `status=${result.status} strength=${result.strength} confidence=${result.confidence} ` +
        `quotes=${JSON.stringify(result.supporting_quotes)} reason="${result.reasoning.substring(0, 120)}"`
      );
    }

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TOWER][SEMANTIC] LLM call failed: ${errMsg} — using keyword fallback judge`);
    const kwResult = keywordFallbackJudge(input);
    if (TRACE) {
      console.log(
        `[TOWER][SEMANTIC] keyword_fallback after LLM failure: lead="${leadName}" satisfies=${kwResult.satisfies} ` +
        `status=${kwResult.status} strength=${kwResult.strength} confidence=${kwResult.confidence} ` +
        `quotes=${JSON.stringify(kwResult.supporting_quotes)}`
      );
    }
    return kwResult;
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
      ev.semantic_status = judgement.status;
      ev.semantic_strength = judgement.strength;
      ev.semantic_confidence = judgement.confidence;
      ev.semantic_reasoning = judgement.reasoning;
      ev.semantic_supporting_quotes = judgement.supporting_quotes;

      if (SEMANTIC_TRACE) {
        console.log(
          `[TOWER][SEMANTIC] lead="${ev.lead_name}" attr="${ev.attribute}" ` +
          `upstream_verdict=${ev.verdict} semantic_verdict=${judgement.satisfies} ` +
          `status=${judgement.status} strength=${judgement.strength} confidence=${judgement.confidence} ` +
          `judge_mode=${judgement.judge_mode ?? "unknown"} ` +
          `supporting_quotes=${JSON.stringify(judgement.supporting_quotes)} ` +
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
