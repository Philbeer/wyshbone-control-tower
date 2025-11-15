# EVAL-008: Live User Run Logging - UI Integration Guide

## Overview

This document describes how Wyshbone UI should integrate with Tower's live user run logging system (EVAL-008). This feature enables Tower to:

- Log real user conversations from Wyshbone UI
- Display them on the Tower dashboard
- Trigger investigations from live user interactions
- Auto-detect issues in production usage

## API Endpoint

### POST /tower/runs/log

Log a completed user conversation from Wyshbone UI.

**URL**: `http://<tower-host>/tower/runs/log`

**Method**: `POST`

**Content-Type**: `application/json`

**Authentication**: None currently (optional header check can be added if needed)

### Request Payload

```json
{
  "source": "live_user",
  "userId": "user@example.com",
  "sessionId": "session-abc-123",
  "request": {
    "inputText": "Find me burger bars in Kent",
    "toolCalls": [
      {
        "name": "search_places",
        "args": {
          "query": "burger bars",
          "location": "Kent"
        }
      }
    ]
  },
  "response": {
    "outputText": "Here are 5 burger bars I found in Kent:\n1. Five Guys\n2. Burger King\n...",
    "toolResultsSummary": "Found 5 places"
  },
  "status": "success",
  "durationMs": 2345,
  "meta": {
    "model": "gpt-4",
    "tokensUsed": 450
  }
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Should be `"live_user"` for UI runs |
| `request.inputText` | string | The user's message that triggered this run |
| `response.outputText` | string | Final assistant reply (plain text or markdown) |
| `status` | enum | One of: `"success"`, `"error"`, `"timeout"`, `"fail"` |
| `durationMs` | number | Total time taken in milliseconds |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string \| null | User identifier (email, id, etc.) |
| `sessionId` | string \| null | Chat/session identifier for grouping |
| `request.toolCalls` | array | Array of tool calls made during this run |
| `response.toolResultsSummary` | string \| null | Summary of tool execution results |
| `meta` | object | Additional metadata (model, tokens, etc.) |

### Status Values

- **`success`**: Run completed successfully
- **`error`**: Explicit error occurred (exception, API failure, etc.)
- **`timeout`**: Run exceeded time limit
- **`fail`**: Run completed but produced poor/incorrect output

### Response

**Success (200 OK)**:

```json
{
  "id": "live-1234567890-abc123",
  "status": "success"
}
```

**Error (4xx/5xx)**:

```json
{
  "error": "Invalid payload: request.inputText is required"
}
```

## Integration Example (TypeScript)

```typescript
// After a user conversation completes in Wyshbone UI
async function logRunToTower(conversation: Conversation) {
  const payload = {
    source: "live_user",
    userId: conversation.userId || null,
    sessionId: conversation.sessionId || null,
    request: {
      inputText: conversation.userMessage,
      toolCalls: conversation.toolCalls?.map(tc => ({
        name: tc.toolName,
        args: tc.arguments
      }))
    },
    response: {
      outputText: conversation.assistantReply,
      toolResultsSummary: conversation.toolResults 
        ? `${conversation.toolResults.length} tools executed` 
        : null
    },
    status: conversation.error ? "error" : "success",
    durationMs: conversation.endTime - conversation.startTime,
    meta: {
      model: conversation.model,
      tokensUsed: conversation.usage?.totalTokens
    }
  };

  try {
    const response = await fetch('http://tower-host/tower/runs/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Failed to log run to Tower:', await response.text());
    } else {
      const result = await response.json();
      console.log('Logged run to Tower:', result.id);
    }
  } catch (err) {
    console.error('Error logging to Tower:', err);
    // Don't fail the user's request if Tower logging fails
  }
}
```

## When to Log Runs

**DO log**:
- Every completed user conversation (success or error)
- Conversations where the user got a response
- Timeout scenarios

**DON'T log**:
- Partial/incomplete conversations
- System health checks
- Internal test messages

## Dashboard Integration

Once runs are logged, they will appear in the Tower dashboard:

1. **Recent Live Runs** panel shows the last 20 live user interactions
2. Each run displays:
   - User input (first 80 chars)
   - Assistant response (first 80 chars)
   - Status badge (success/error/timeout/fail)
   - Duration in milliseconds
   - User and session identifiers
3. Click "Investigate" button to trigger a Tower investigation
4. Investigations appear in the Evaluator Console for diagnosis and patch suggestions

## Auto-Detection

Tower currently has **conservative** auto-detection for live runs:

- Only explicit `error` status triggers auto-logging
- No automatic investigations created yet (future enhancement)
- Manual investigation always available via dashboard

Future versions may add:
- Repeated errors from same user/session
- Timeout pattern detection
- Quality degradation signals

## Troubleshooting

### Runs not appearing in dashboard

1. Check Tower logs for validation errors
2. Verify `source: "live_user"` is set correctly
3. Ensure required fields are present
4. Check Tower is reachable from UI server

### Investigation not working

1. Verify run was logged successfully (check Tower dashboard)
2. Only `live_user` runs can be investigated via live run endpoint
3. Check browser console for API errors

## Best Practices

1. **Non-blocking**: Log runs asynchronously, don't block user responses
2. **Error handling**: Catch and log Tower failures without affecting UX
3. **Sampling**: For high-volume apps, consider sampling (e.g., 10% of runs)
4. **Privacy**: Redact sensitive user data before logging if needed
5. **Meaningful status**: Use specific status values (`error` vs `fail`)

## Future Enhancements

Planned improvements:

- More sophisticated auto-detection (repeated errors, quality signals)
- Rate limiting / sampling configuration
- Authentication via shared secret
- Batch logging endpoint for multiple runs
- Webhook notifications for critical errors

## Support

For questions or issues with Tower integration:

1. Check Tower logs: `grep "EVAL-008" server.log`
2. Review investigation notes in Tower dashboard
3. Contact Tower maintainers

---

Last updated: EVAL-008 implementation
