# EVAL-009: Auto Conversation Quality Detection

## Overview

**EVAL-009 Auto Detection** is an enhancement to the existing EVAL-009 (Conversation Quality Investigator) that automatically analyzes live user conversations from Wyshbone UI to detect conversation quality issues. While the original EVAL-009 relies on manual flagging of problematic conversations, the automatic detection system proactively identifies issues in real-time as users interact with the Wyshbone assistant.

## Architecture

The system consists of four main components:

### 1. Auto-Detection Trigger (`src/evaluator/runStore.ts`)

- **Location**: POST `/tower/runs/log` endpoint
- **Trigger**: ALL completed `live_user` runs (not just errors)
- **Rationale**: "Most embarrassing failures happen during real usage, not just errors"

```typescript
// After storing a run
if (validated.source === "live_user" && validated.status !== "running") {
  createAutoConversationQualityInvestigation({
    runId: run.id,
    sessionId: run.session_id,
    userId: run.user_id,
    conversationTranscript: run.messages || []
  }).catch(err => {
    console.error(`Failed to create auto conversation quality investigation:`, err);
  });
}
```

### 2. Investigation Creation (`src/evaluator/autoConversationQualityInvestigations.ts`)

Creates investigations with:
- **Deduplication**: 24-hour window based on `runId`
- **Metadata**: Stores full conversation transcript, user/session IDs
- **Async Processing**: Triggers LLM analysis in background

```typescript
export async function createAutoConversationQualityInvestigation(params: {
  runId: string;
  sessionId?: string;
  userId?: string | null;
  conversationTranscript: any[];
}): Promise<Investigation | null>
```

### 3. LLM Analysis Worker (`src/evaluator/autoConversationQualityAnalysis.ts`)

- **Model**: GPT-4o-mini (configurable via `EVAL_MODEL_ID`)
- **System Prompt**: Embeds Wyshbone V1 spec for context-aware analysis
- **Temperature**: 0.3 (for consistent, deterministic analysis)
- **Output**: Structured JSON with failure classification

```typescript
export async function runAutoConversationQualityAnalysis(
  investigation: Investigation
): Promise<WyshboneConversationAnalysis | null>
```

### 4. Dashboard UI (`client/src/components/AutoConversationQualityCard.tsx`)

- **Panel**: "Auto Conversation Quality" section on Tower dashboard
- **Features**:
  - Lists recent auto-detected conversation issues
  - Color-coded badges for failure types and severity
  - Modal view with full conversation transcript
  - "Open in Console" button for investigation details

## Wyshbone-Specific Failure Categories

The auto-detection system uses **Wyshbone-specific** failure categories (different from manual EVAL-009 flags):

| Category | Description | Example |
|----------|-------------|---------|
| `greeting_flow` | First message doesn't offer domain OR direct search | User: "I want a laptop" → Bot: "What's your budget?" |
| `domain_followup` | After domain provided, bot doesn't ask market/geography | User: "Electronics" → Bot: "What electronics?" |
| `misinterpreted_intent` | Bot misunderstands user's shopping intent | User: "shoes" → Bot: "Need sizing help?" |
| `repetition` | Bot asks same question multiple times | Bot repeats "Browse or search?" twice |
| `dead_end` | No actionable next step for user | Bot: "That's nice!" (then nothing) |
| `other` | Unusual issues not fitting above categories | Edge cases |

### Severity Levels

- **high**: Blocks user progress or causes confusion
- **medium**: Suboptimal UX but user can recover
- **low**: Minor issue, barely noticeable

## Wyshbone V1 Specification (Embedded in Analysis)

The LLM analysis worker embeds the following business rules from Wyshbone V1 spec:

### Greeting Flow (Critical Rule)

> **First message MUST offer:**
> 1. **Domain selection** (e.g., "browse by category: electronics, clothing, home goods")
> 2. **OR direct search** (e.g., "search for something specific")
>
> **Violations:**
> - Jumping straight to product search without offering domain
> - Asking clarifying questions before domain offer
> - Offering neither domain nor search option

### Domain Follow-up (Critical Rule)

> **After user provides a domain, bot MUST ask:**
> - Market/geography (e.g., "US, UK, EU market?")
> - OR location (e.g., "What's your location?")
>
> **Violations:**
> - Proceeding to product search without asking market
> - Asking unrelated questions after domain

## Data Model

### AutoConversationQualityMeta

```typescript
export interface AutoConversationQualityMeta {
  source: "auto_conversation_quality";
  focus: {
    kind: "conversation";
  };
  runId: string;
  sessionId?: string;
  userId?: string | null;
  conversation_transcript: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  analysis?: WyshboneConversationAnalysis;  // Set after LLM analysis
  clean?: boolean;  // true if no issues detected
}
```

### WyshboneConversationAnalysis

```typescript
export interface WyshboneConversationAnalysis {
  failure_type: "greeting_flow" | "domain_followup" | "misinterpreted_intent" | "repetition" | "dead_end" | "other";
  severity: "low" | "medium" | "high";
  summary: string;
  user_intent: string;
  expected_behaviour: string;
  actual_behaviour: string;
  suggested_fix: string;
  suggested_tests: string[];  // Behaviour test recommendations
}
```

## API Endpoints

### GET /tower/auto-conversation-quality

Returns all auto-detected conversation quality investigations.

**Response:**
```json
[
  {
    "id": "acq-run-123-1234567890",
    "createdAt": "2025-11-17T12:00:00Z",
    "trigger": "auto_conversation_quality",
    "runId": "run-123",
    "runMeta": {
      "source": "auto_conversation_quality",
      "focus": { "kind": "conversation" },
      "runId": "run-123",
      "sessionId": "session-456",
      "userId": "user-789",
      "conversation_transcript": [...],
      "analysis": {
        "failure_type": "greeting_flow",
        "severity": "high",
        "summary": "Bot jumped to product search without offering domain selection",
        ...
      }
    },
    "diagnosis": "Automatic Conversation Quality Analysis\n\nFailure Type: greeting_flow\n..."
  }
]
```

## Testing

### Unit Tests

Run comprehensive tests with example transcripts:

```bash
npx tsx scripts/test-auto-conversation-quality.ts
```

**Test Coverage:**
- ✅ Greeting flow violations
- ✅ Domain follow-up violations
- ✅ Misinterpreted intent
- ✅ Repetition detection
- ✅ Dead-end conversations
- ✅ Correct flows (should pass analysis)
- ✅ 24-hour deduplication

**Example Test Output:**
```
🧪 Testing Auto Conversation Quality Detection
================================================================================

📝 Test: Greeting Flow Violation - No domain offered
--------------------------------------------------------------------------------
🔬 Creating investigation with automatic analysis...
✅ Investigation created: acq-test-greeting-violation-1-1763381958795
⏳ Waiting for async analysis to complete...
✅ Analysis complete:
   Category: greeting_flow
   Severity: high
   Summary: Bot failed to offer domain or search option in first response...
✅ PASS: Detected conversation quality issue as expected
```

### Integration with Wyshbone UI

To integrate with Wyshbone UI (see `docs/EVAL-008_UI_INTEGRATION.md`):

1. After each conversation turn, POST to `/tower/runs/log` with:
   - `source: "live_user"`
   - `messages`: Full conversation history
   - `status`: "success" / "error" / "timeout"

2. Auto-detection triggers automatically for all completed runs

3. No additional API calls needed—investigations are created and analyzed in background

## Comparison: Manual vs Auto Detection

| Aspect | Manual Flagging (EVAL-009) | Auto Detection (EVAL-009 Auto) |
|--------|---------------------------|--------------------------------|
| **Trigger** | User/developer clicks "Flag Conversation" | Automatic on every live_user run |
| **Categories** | Generic (prompt_issue, decision_logic_issue, etc.) | Wyshbone-specific (greeting_flow, domain_followup, etc.) |
| **Input** | session_id, flagged_message_index, optional user_note | runId, full conversation transcript |
| **Deduplication** | 24h by session_id | 24h by runId |
| **Analysis Scope** | Entire conversation window | Full conversation from start |
| **UI Panel** | "Conversation Quality" | "Auto Conversation Quality" |
| **Use Case** | User-reported issues, subjective problems | Objective V1 spec violations |

## Performance Considerations

- **LLM Calls**: One GPT-4o-mini call per unique run (deduplicated)
- **Cost**: ~$0.0001 per analysis (4o-mini pricing)
- **Latency**: Analysis runs asynchronously, doesn't block user
- **Volume**: Sustainable for 1000s of daily conversations

## Future Enhancements

- [ ] Track analysis accuracy metrics (false positives/negatives)
- [ ] Add confidence scores to LLM analysis
- [ ] Auto-generate behaviour tests from detected patterns
- [ ] Integration with patch generation (EVAL-006) for auto-fixes
- [ ] Historical trending: track failure types over time
- [ ] A/B testing: compare before/after fix success rates

## Production Checklist

- [x] LLM system prompt includes V1 spec
- [x] Deduplication prevents investigation spam
- [x] Async processing doesn't block run logging
- [x] Dashboard UI displays both manual and auto investigations
- [x] Unit tests cover all failure categories
- [x] API routes properly registered in server.js
- [ ] Monitor LLM costs in production
- [ ] Set up alerts for high failure rates
- [ ] Regular review of false positives

## Environment Variables

- `OPENAI_API_KEY`: Required for LLM analysis
- `EVAL_MODEL_ID`: Override default model (default: `gpt-4o-mini`)

## Related Documentation

- `docs/EVAL-008_UI_INTEGRATION.md`: How to send live user runs
- `docs/EVAL-009_CONVERSATION_QUALITY.md`: Manual conversation flagging
- `docs/EVAL-016_PATCH_FAILURE.md`: Patch failure post-mortems
