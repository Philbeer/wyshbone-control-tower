# Behaviour Tests API Investigation - EVAL-002

## Problem Statement
The behaviour tests in `src/evaluator/behaviourTests.ts` were calling the Wyshbone UI `/api/chat` endpoint with an incorrect request format, receiving "400 Invalid request format" errors due to missing `user` and `messages` fields.

## Investigation Summary

### API Request Format Discovery
Through iterative testing, I discovered the correct schema for the Wyshbone UI `/api/chat` endpoint:

```typescript
interface ChatRequest {
  user: {
    id: string;
    name: string;
    email: string;      // REQUIRED
    domain?: string;    // Optional, used for personalization
  };
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  sessionId?: string;   // Optional
  goal?: string;        // Optional
}
```

### Key Findings

1. **Required Fields**: The endpoint requires both `user` object and `messages` array
2. **User Email**: The `user.email` field is mandatory (Zod validation error if missing)
3. **Messages Format**: Must be an array of message objects with `role` and `content`

### Authentication Challenge

**Current Status**: The `/api/chat` endpoint returns `401 Unauthorized` when called from Tower, regardless of whether X-EXPORT-KEY is included.

**Evidence**:
- Testing with correct payload + no auth: 401 Unauthorized
- Testing with correct payload + X-EXPORT-KEY header: 401 Unauthorized  
- Other endpoints (`/export/status.json`) work fine with X-EXPORT-KEY

**Conclusion**: The `/api/chat` endpoint uses session-based authentication and is not accessible to external services like Tower.

### Discrepancy with Task Description

The task states that tests currently receive "400 ZodError" responses, but our testing shows "401 Unauthorized". This suggests either:
1. The Wyshbone UI has a test mode that bypasses authentication
2. The UI needs to be updated to accept X-EXPORT-KEY for testing purposes
3. There's a different endpoint that should be used for testing

## Implementation Status

### Completed
✅ Discovered correct `/api/chat` request schema
✅ Created TypeScript types (`src/evaluator/chatApiTypes.ts`)
✅ Updated `callWyshboneUI()` to use correct format
✅ Added domain parameter support for personalization tests
✅ Improved error handling and response parsing

### Blocked
❌ Tests return 401 Unauthorized instead of exercising real chat behavior
❌ Cannot test actual chat responses until authentication is resolved

## Next Steps

To unblock the behaviour tests, one of the following is needed:

### Option A: Update Wyshbone UI (Recommended)
Add X-EXPORT-KEY authentication support to `/api/chat` endpoint for testing:

```typescript
// In Wyshbone UI server/routes.ts or similar
app.post('/api/chat', async (req, res) => {
  // Allow export key for testing from Tower
  const exportKey = req.headers['x-export-key'];
  if (exportKey && exportKey === process.env.EXPORT_KEY) {
    // Bypass session auth for testing
    // Continue with chat logic...
  }
  
  // Otherwise require session authentication
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ...
});
```

### Option B: Create Test Endpoint
Add a dedicated test endpoint in Wyshbone UI:

```typescript
app.post('/api/chat/test', authenticateExportKey, async (req, res) => {
  // Same logic as /api/chat but accessible via export key
});
```

### Option C: Mock for Testing
If real chat testing isn't critical, implement a mock mode in Tower that simulates responses based on patterns.

## Files Modified

- `src/evaluator/behaviourTests.ts` - Updated to use correct schema
- `src/evaluator/chatApiTypes.ts` - New type definitions
- `scripts/test-ui-chat.js` - Test script for API experimentation

## Test Results

Current test execution:
```json
{
  "testId": "greeting-basic",
  "status": "error",
  "details": "Error: UI API returned 401: {\"error\":\"Unauthorized\"}",
  "durationMs": 55
}
```

Expected once authentication is resolved:
```json
{
  "testId": "greeting-basic",
  "status": "pass",
  "details": "Response contains greeting and asks about user goals",
  "rawLog": { "response": "Hello! I'm here to help..." },
  "durationMs": 1250
}
```
