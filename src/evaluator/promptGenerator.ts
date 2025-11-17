/**
 * Generate a fully formatted "Copy & Paste prompt for Replit UI" based on patch suggestions
 */
export function generateReplitPatchPrompt(patchSuggestion: string): string {
  return `You are my coding assistant for the Wyshbone UI repl.

Wyshbone Control Tower has analyzed a conversation and produced this suggested patch:

"${patchSuggestion}"

Your task is to implement this behavior in the Wyshbone UI codebase.

## Implementation Instructions

### 1. Code Integration
- Identify the relevant files in the Wyshbone UI codebase that need to be modified
- Make the necessary changes to implement the suggested patch
- Ensure all changes follow the existing code style and patterns in the codebase
- Add appropriate error handling and edge case coverage

### 2. Behavior Changes
- Implement the exact behavior described in the patch suggestion
- Test the changes thoroughly to ensure they work as expected
- Verify that the fix addresses the root cause identified in the diagnosis
- Ensure no regressions are introduced in existing functionality

### 3. Tower Logging Integration
- If the patch involves agent behavior or conversation handling, ensure proper logging to Tower
- Use the existing Tower run logging format with these fields:
  - conversation_run_id: Group related messages in a single conversation
  - goal_summary: Brief description of what the user asked for
  - status: "completed", "failed", or "timeout"
  - meta: Include relevant metadata (duration, tools used, model, input/output text)

### 4. Backward Compatibility
- Ensure changes are backward compatible with existing conversations
- Don't break existing features or workflows
- Add migration logic if database schema changes are needed

### 5. Output Format
- After implementing the patch, describe what you changed
- List all modified files
- Explain how the fix addresses the original issue
- Mention any potential side effects or considerations

## Testing Requirements
- Test the implementation with sample inputs similar to the flagged conversation
- Verify the fix resolves the issue without introducing new problems
- Check edge cases and error scenarios

Please implement this patch following these guidelines.`;
}
