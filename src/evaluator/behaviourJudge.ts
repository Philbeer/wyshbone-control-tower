import { openai } from "../lib/openai";
import { db } from "../lib/db";
import { behaviourJudgeResults } from "../../shared/schema";

export type BehaviourOutcome = "PASS" | "HONEST_PARTIAL" | "BATCH_EXHAUSTED" | "CAPABILITY_FAIL" | "WRONG_DECISION";

export interface BehaviourJudgeInput {
  run_id: string;
  original_goal: string;
  strategy: string | null;
  verification_policy: string | null;
  delivered_count: number;
  requested_count: number | null;
  constraints: Array<{
    type: string;
    field: string;
    value: string | number;
    hardness: "hard" | "soft";
  }>;
  constraint_verdicts: Array<{
    type: string;
    field: string;
    value: string | number;
    verdict: string;
    reason?: string;
  }>;
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

const BEHAVIOUR_JUDGE_SYSTEM_PROMPT = `You are the Behaviour Judge for Wyshbone. You receive the result of a completed agent run and must classify the agent's BEHAVIOUR into exactly one outcome.

You will receive: the user's original goal, the strategy used, how many leads were delivered vs requested, constraint verdicts, Tower's verdict and gaps, and whether the agent clarified or ran directly.

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

## Response format

Respond with valid JSON only, no markdown fences:
{
  "outcome": "PASS",
  "reason": "Brief explanation of why this outcome was chosen.",
  "confidence": 85
}`;

function buildBehaviourJudgePrompt(input: BehaviourJudgeInput): string {
  return JSON.stringify({
    original_goal: input.original_goal,
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
  }, null, 2);
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
    max_tokens: 400,
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
        console.log(`[BEHAVIOUR_JUDGE] run_id=${input.run_id} outcome=${result.outcome} confidence=${result.confidence}`);
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
