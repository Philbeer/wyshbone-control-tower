# EVAL-009: Conversation Quality Investigator

## Overview

The Conversation Quality Investigator analyzes flagged assistant conversations to identify chat behavior issues and provide actionable recommendations for improvement.

## Architecture

### Data Flow

1. **Wyshbone UI flags a conversation** → POST `/tower/conversation-flag`
2. **Tower creates investigation** → Stored in `investigations` table with `source: "conversation_quality"`
3. **LLM analysis triggered** → Async worker processes the conversation
4. **Analysis stored** → Results written to `run_meta.analysis` and `diagnosis` fields
5. **Dashboard displays** → UI shows flagged conversations with analysis

### Components

- **API Endpoint**: `POST /tower/conversation-flag` - Accepts flagged conversations
- **Investigation Storage**: `src/evaluator/conversationQualityInvestigations.ts`
- **LLM Analysis**: `src/evaluator/conversationQualityAnalysis.ts`
- **UI Component**: `client/src/components/ConversationQualityCard.tsx`
- **API Route**: `server/routes-conversation-quality.ts`

## API Reference

### POST /tower/conversation-flag

Creates a new conversation quality investigation.

**Request Body:**
```json
{
  "session_id": "string (required)",
  "user_id": "string | null (optional)",
  "messages": [
    {
      "role": "system | user | assistant",
      "content": "string"
    }
  ],
  "flagged_message_index": 2,
  "user_note": "string (optional)"
}
```

**Response:**
```json
{
  "investigation_id": "cq-session-123-1234567890",
  "status": "created",
  "message": "Investigation created successfully. Analysis will be processed asynchronously."
}
```

**Validation Rules:**
- `session_id` must be a non-empty string
- `messages` must be a non-empty array
- `flagged_message_index` must be a valid index within the messages array
- `user_id` can be null for anonymous users
- `user_note` is optional free-text explanation

### GET /tower/conversation-quality

Retrieves all conversation quality investigations.

**Response:**
```json
[
  {
    "id": "cq-session-123-1234567890",
    "createdAt": "2025-01-15T10:30:00Z",
    "trigger": "conversation_quality",
    "notes": "Conversation Quality Investigation...",
    "runMeta": {
      "source": "conversation_quality",
      "focus": {
        "kind": "conversation"
      },
      "sessionId": "session-123",
      "userId": "user-456",
      "flagged_message_index": 2,
      "conversation_window": [...],
      "user_note": "Assistant response too brief",
      "analysis": {
        "failure_category": "prompt_issue",
        "summary": "Assistant provided minimal response",
        "repro_scenario": "...",
        "suggested_prompt_changes": "...",
        "suggested_behaviour_test": "..."
      }
    },
    "diagnosis": "..."
  }
]
```

## Analysis Categories

The LLM classifies conversation failures into five categories:

1. **prompt_issue** - System prompt or instructions are inadequate
   - Example: Missing guidelines for response length or detail level

2. **decision_logic_issue** - Assistant made poor decisions about actions
   - Example: Chose to respond briefly when detailed help was needed

3. **missing_behaviour_test** - Specific scenario lacks test coverage
   - Example: No test for handling ambiguous marketing requests

4. **missing_clarification_logic** - Should have asked for clarification
   - Example: User request was vague but assistant didn't ask questions

5. **unclear_or_ambiguous_user_input** - User input genuinely unclear
   - Example: Request lacks essential context that can't be inferred

## Analysis Output

The LLM provides structured analysis including:

- **failure_category**: One of the five categories above
- **summary**: Human-readable explanation of the issue
- **repro_scenario**: Minimal transcript snippet showing the problem
- **suggested_prompt_changes**: Recommendations for system prompt improvements
- **suggested_behaviour_test**: Description of test that should exist

## UI Features

The Conversation Quality card in the Tower dashboard displays:

- Recent flagged conversations with color-coded category badges
- Analysis summaries with timestamps
- Conversation window with flagged message highlighted
- Suggested fixes and test recommendations
- "Open in Console" button for detailed investigation
- Refresh button to reload data

## Deduplication

Investigations are deduplicated by session ID within a 24-hour window:

- If a session is flagged multiple times within 24 hours, the same investigation is reused
- Additional flags are noted in the investigation's notes field
- This prevents spam from repeated flags of the same conversation

## Integration with Wyshbone UI

To flag a conversation from Wyshbone UI:

```typescript
async function flagConversation(
  sessionId: string,
  messages: Message[],
  flaggedIndex: number,
  userNote?: string
) {
  const response = await fetch('/tower/conversation-flag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      user_id: getCurrentUserId(), // or null
      messages: messages,
      flagged_message_index: flaggedIndex,
      user_note: userNote
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to flag conversation');
  }
  
  return response.json();
}
```

## Testing

Run the integration test:

```bash
npx tsx scripts/test-conversation-quality.ts
```

This test verifies:
- Investigation creation with correct metadata
- Data persistence and retrieval
- Deduplication logic
- LLM analysis (requires OPENAI_API_KEY)

## Troubleshooting

**Analysis not completing:**
- Ensure OPENAI_API_KEY is set in environment
- Check Tower logs for LLM errors
- Verify investigation exists with correct structure

**Investigations not appearing in UI:**
- Check `/tower/conversation-quality` endpoint responds
- Verify investigations have `source: "conversation_quality"` in run_meta
- Check browser console for fetch errors

**Duplicate investigations:**
- Verify session IDs are consistent
- Check deduplication window (24 hours)
- Review investigation creation logs

## Future Enhancements

1. **Auto-flagging**: Automatically flag conversations based on heuristics
2. **Batch analysis**: Process multiple flagged conversations together
3. **Trend analysis**: Identify patterns across multiple flags
4. **Integration with auto-patch**: Automatically generate fixes for common issues
5. **User feedback loop**: Allow users to rate analysis quality
