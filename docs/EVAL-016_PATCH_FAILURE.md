# EVAL-016: Patch Failure Post-Mortem

## Overview

The Patch Failure Post-Mortem system analyzes rejected auto-generated patches to understand why they failed evaluation, categorizes the failure, and provides actionable recommendations for improvement. This helps improve the auto-patch generation system over time and provides insights into what went wrong.

## Architecture

### Data Flow

1. **Auto-patch generated** → Patch created by EVAL-006 for an investigation
2. **Patch evaluated** → EVAL-004 gatekeeper rejects patch with reasons
3. **Failure investigation created** → Stored in `investigations` table with `source: "patch_failure"`
4. **LLM analysis triggered** → Async worker analyzes why the patch was rejected
5. **Analysis stored** → Results written to `run_meta.analysis` and `diagnosis` fields
6. **Dashboard displays** → UI shows patch failures with post-mortem analysis

### Components

- **Investigation Storage**: `src/evaluator/patchFailureInvestigations.ts`
- **LLM Analysis**: `src/evaluator/patchFailureAnalysis.ts`
- **Hook Point**: `src/evaluator/autoPatch.ts` (triggers investigation on rejection)
- **UI Component**: `client/src/components/PatchFailuresCard.tsx`
- **API Route**: `server/routes-patch-failures.ts`

## Integration Points

### Automatic Triggering

Patch failure investigations are **automatically created** when:

1. An auto-generated patch is created via `requestAutoPatchForInvestigation()`
2. The patch is evaluated by `PatchEvaluator`
3. The evaluation result is `"rejected"`
4. The system calls `createPatchFailureInvestigation()` with:
   - Original investigation ID
   - Patch ID (evaluation ID)
   - Patch diff text
   - Sandbox evaluation result (reasons, test results, risk level)

This happens automatically in `src/evaluator/autoPatch.ts` without any manual intervention.

## API Reference

### GET /tower/patch-failures

Retrieves all patch failure investigations.

**Response:**
```json
[
  {
    "id": "pf-inv-123-1234567890",
    "createdAt": "2025-01-15T10:30:00Z",
    "trigger": "patch_failure",
    "notes": "Patch Failure Investigation...",
    "runMeta": {
      "source": "patch_failure",
      "focus": {
        "kind": "patch"
      },
      "original_investigation_id": "inv-123",
      "patch_id": "eval-456",
      "patch_diff": "diff --git a/...",
      "sandbox_result": {
        "status": "rejected",
        "reasons": [
          "❌ RULE 1: Test \"test-id\" FAILED after applying patch"
        ],
        "riskLevel": "high",
        "testResultsBefore": [...],
        "testResultsAfter": [...],
        "diff": {...}
      },
      "analysis": {
        "failure_reason": "The patch broke existing test coverage",
        "failure_category": "broke_existing_tests",
        "next_step": "Generate new patch with constraints...",
        "suggested_constraints_for_next_patch": "Do not modify the routing logic..."
      }
    },
    "diagnosis": "..."
  }
]
```

## Failure Categories

The LLM classifies patch failures into seven categories:

1. **broke_existing_tests** - Patch caused previously passing tests to fail
   - Example: Modified shared code that broke unrelated test cases
   - Most severe category indicating regression

2. **did_not_fix_original_issue** - Patch didn't solve the problem it was meant to fix
   - Example: Changed the wrong part of the code
   - Original failing test still fails

3. **misinterpreted_requirement** - Patch implemented the wrong solution
   - Example: Misunderstood the investigation diagnosis or requirement
   - Fixed wrong behavior or added wrong feature

4. **test_is_ambiguous_or_wrong** - The test itself may be incorrect
   - Example: Test expectations don't match actual requirements
   - Suggests the test should be reviewed or rewritten

5. **wrong_repo_or_layer** - Change belongs in different codebase
   - Example: Trying to fix a UI issue by modifying Tower code
   - Suggests filing an issue in the correct repository

6. **insufficient_context** - Not enough information to generate correct patch
   - Example: Missing code snapshots or incomplete diagnosis
   - Suggests gathering more context before retrying

7. **other** - Failure doesn't fit above categories
   - Catch-all for unusual or complex failures

## Analysis Output

The LLM provides structured analysis including:

- **failure_reason**: Concise 1-2 sentence explanation of why the patch was rejected
- **failure_category**: One of the seven categories above
- **next_step**: Clear recommendation for what should happen next
- **suggested_constraints_for_next_patch**: Optional hints for the next auto-patch attempt
  - Example: "Do not modify file X", "Only change prompt section Y"
  - Helps narrow the scope for better results on retry

## UI Features

The Patch Failures card in the Tower dashboard displays:

- Recent patch failures with color-coded category badges
- Risk level indicators (low/medium/high)
- Failure reason summaries with timestamps
- Patch ID and original investigation references
- "Open in Console" button for detailed investigation
- Refresh button to reload data

### Modal Details View

When clicking on a patch failure card, the modal shows:

- **Analysis Section**:
  - Failure category badge with color coding
  - Detailed failure reason
  - Recommended next steps
  - Suggested constraints for next patch (if applicable)

- **Sandbox Result**:
  - Rejection status badge
  - Risk level
  - Complete list of rejection reasons from gatekeeper

- **Patch Diff**:
  - Truncated view of the unified diff (first 2000 characters)
  - Shows what changes were attempted

- **Metadata**:
  - Original investigation ID (links back to the source issue)
  - Patch evaluation ID

## Tracking Multiple Patch Failures

Each rejected patch generates its own investigation record:

- Every patch failure is tracked separately with a unique investigation ID
- Multiple patches for the same original investigation are linked via `original_investigation_id`
- This allows detailed analysis of each patch attempt independently
- Enables tracking iteration history and learning from repeated failures
- **Note**: Unlike conversation quality investigations, patch failures are NOT deduplicated

## LLM Analysis Prompt

The analysis prompt includes:

1. **Original Problem**: Investigation notes and diagnosis from the source issue
2. **Attempted Patch**: Complete unified diff showing what was tried
3. **Sandbox Result**: Full evaluation output including:
   - Gatekeeper rejection reasons
   - Before/after test results
   - Status changes and regressions
4. **Analysis Task**: Structured JSON output with:
   - failure_reason
   - failure_category
   - next_step
   - suggested_constraints_for_next_patch (optional)

The LLM uses GPT-4o-mini (same as EVAL-009) for cost-effective analysis.

## Testing

Run the integration test:

```bash
npx tsx scripts/test-patch-failure.ts
```

This test verifies:
- Investigation creation with correct metadata
- Data persistence and retrieval
- LLM analysis (requires OPENAI_API_KEY)
- Failure category validation
- Deduplication logic

## Troubleshooting

**Analysis not completing:**
- Ensure OPENAI_API_KEY is set in environment
- Check Tower logs for LLM errors
- Verify investigation exists with correct structure

**Investigations not appearing in UI:**
- Check `/tower/patch-failures` endpoint responds
- Verify investigations have `source: "patch_failure"` in run_meta
- Check browser console for fetch errors

**Patch failures not being created:**
- Verify autoPatch.ts hook is executing
- Check that PatchEvaluator.getEvaluation() returns data
- Review auto-patch generation logs

**Duplicate investigations:**
- Verify original investigation IDs are consistent
- Check deduplication window (24 hours)
- Review investigation creation logs

## Integration with Auto-Patch Pipeline

The patch failure system integrates seamlessly with EVAL-006 (Auto-Patch Generator):

1. Investigation created (any source: behaviour test, live user, manual)
2. User clicks "Auto patch (beta)" button
3. `requestAutoPatchForInvestigation()` generates and evaluates patch
4. If rejected → Patch failure investigation created automatically
5. LLM analyzes rejection and suggests constraints
6. Human can review analysis and retry with better context

This creates a feedback loop for improving patch quality over time.

## Future Enhancements

1. **Constraint Integration**: Feed `suggested_constraints_for_next_patch` back into patch generator
2. **Learning from Patterns**: Identify common failure patterns across multiple patches
3. **Success Rate Tracking**: Track patch success/failure rates by category
4. **Auto-Retry Logic**: Automatically retry patches with adjusted constraints
5. **Feedback to Test Quality**: Flag tests that frequently cause ambiguous failures
6. **Integration with Conversation Quality**: Link prompt issues to conversation problems

## Production Notes

- Requires `OPENAI_API_KEY` for LLM analysis
- Analysis runs asynchronously (doesn't block patch evaluation)
- Investigations stored in same `investigations` table as other types
- Uses PostgreSQL jsonb for flexible metadata storage
- Compatible with existing investigation console and tooling
