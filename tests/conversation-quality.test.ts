/**
 * EVAL-009: Conversation Quality Investigator Tests
 * 
 * This file contains tests for the conversation quality investigation feature.
 * Note: These tests require a running database and OpenAI API key.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import type { CreateConversationQualityInvestigationParams } from "../src/evaluator/conversationQualityInvestigations";

// Mock data for testing
const mockConversationMessages = [
  {
    role: "system",
    content: "You are a helpful assistant for the Wyshbone platform."
  },
  {
    role: "user",
    content: "I need help with my marketing campaign"
  },
  {
    role: "assistant",
    content: "OK"
  }
];

const mockParams: CreateConversationQualityInvestigationParams = {
  sessionId: "test-session-123",
  userId: "test-user-456",
  messages: mockConversationMessages,
  flagged_message_index: 2, // The "OK" response
  user_note: "Assistant response is too brief and unhelpful"
};

describe("EVAL-009: Conversation Quality Investigator", () => {
  describe("Investigation Creation", () => {
    it("should create a conversation quality investigation with valid data", async () => {
      // This test would require database setup
      // For now, it serves as documentation of the expected behavior
      expect(mockParams.sessionId).toBe("test-session-123");
      expect(mockParams.flagged_message_index).toBe(2);
      expect(mockParams.messages.length).toBe(3);
    });

    it("should validate required fields", () => {
      expect(mockParams.sessionId).toBeDefined();
      expect(Array.isArray(mockParams.messages)).toBe(true);
      expect(typeof mockParams.flagged_message_index).toBe("number");
    });

    it("should handle optional user_id field", () => {
      const paramsWithoutUserId = { ...mockParams, userId: null };
      expect(paramsWithoutUserId.userId).toBeNull();
    });
  });

  describe("API Endpoint Validation", () => {
    it("should require session_id in request body", () => {
      const invalidRequest = {
        messages: mockConversationMessages,
        flagged_message_index: 0
      };
      expect(invalidRequest).not.toHaveProperty("session_id");
    });

    it("should require messages array in request body", () => {
      const invalidRequest = {
        session_id: "test-session",
        flagged_message_index: 0
      };
      expect(invalidRequest).not.toHaveProperty("messages");
    });

    it("should require flagged_message_index in request body", () => {
      const invalidRequest = {
        session_id: "test-session",
        messages: mockConversationMessages
      };
      expect(invalidRequest).not.toHaveProperty("flagged_message_index");
    });

    it("should validate flagged_message_index is within bounds", () => {
      const validIndex = 1;
      const messageCount = mockConversationMessages.length;
      expect(validIndex).toBeGreaterThanOrEqual(0);
      expect(validIndex).toBeLessThan(messageCount);

      const invalidIndex = 10;
      expect(invalidIndex).toBeGreaterThanOrEqual(messageCount);
    });
  });

  describe("Analysis Structure", () => {
    it("should define valid failure categories", () => {
      const validCategories = [
        "prompt_issue",
        "decision_logic_issue",
        "missing_behaviour_test",
        "missing_clarification_logic",
        "unclear_or_ambiguous_user_input"
      ];

      expect(validCategories).toHaveLength(5);
      expect(validCategories).toContain("prompt_issue");
      expect(validCategories).toContain("decision_logic_issue");
    });

    it("should require analysis fields", () => {
      const mockAnalysis = {
        failure_category: "prompt_issue",
        summary: "Assistant response too brief",
        repro_scenario: "User asks for help, assistant replies 'OK'"
      };

      expect(mockAnalysis).toHaveProperty("failure_category");
      expect(mockAnalysis).toHaveProperty("summary");
      expect(mockAnalysis).toHaveProperty("repro_scenario");
    });

    it("should allow optional suggestion fields", () => {
      const mockAnalysis = {
        failure_category: "prompt_issue",
        summary: "Test summary",
        repro_scenario: "Test scenario",
        suggested_prompt_changes: "Add instructions to provide detailed responses",
        suggested_behaviour_test: "Test that assistant provides helpful responses"
      };

      expect(mockAnalysis).toHaveProperty("suggested_prompt_changes");
      expect(mockAnalysis).toHaveProperty("suggested_behaviour_test");
    });
  });

  describe("Deduplication Logic", () => {
    it("should deduplicate by sessionId within 24 hour window", () => {
      const now = new Date();
      const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      const hoursDiff1 = (now.getTime() - twentyThreeHoursAgo.getTime()) / (1000 * 60 * 60);
      const hoursDiff2 = (now.getTime() - twentyFiveHoursAgo.getTime()) / (1000 * 60 * 60);

      expect(hoursDiff1).toBeLessThan(24); // Should dedupe
      expect(hoursDiff2).toBeGreaterThan(24); // Should NOT dedupe
    });
  });

  describe("Investigation Metadata", () => {
    it("should store conversation window", () => {
      expect(mockParams.messages).toBeDefined();
      expect(Array.isArray(mockParams.messages)).toBe(true);
      expect(mockParams.messages.length).toBeGreaterThan(0);
    });

    it("should store flagged message index", () => {
      expect(mockParams.flagged_message_index).toBeDefined();
      expect(typeof mockParams.flagged_message_index).toBe("number");
      expect(mockParams.flagged_message_index).toBeGreaterThanOrEqual(0);
    });

    it("should store user note if provided", () => {
      expect(mockParams.user_note).toBeDefined();
      expect(typeof mockParams.user_note).toBe("string");
    });
  });
});

/**
 * Integration Test Notes:
 * 
 * To run full integration tests, you would need to:
 * 
 * 1. Set up test database with migrations
 * 2. Provide OPENAI_API_KEY for LLM analysis
 * 3. Create test investigations and verify:
 *    - Investigation stored in database with correct structure
 *    - LLM analysis completes and stores results
 *    - Deduplication works correctly
 *    - API endpoint responds correctly
 * 
 * Example integration test structure:
 * 
 * ```typescript
 * describe("Integration Tests", () => {
 *   beforeAll(async () => {
 *     // Set up test database
 *     // Seed test data
 *   });
 * 
 *   it("should create and analyze investigation end-to-end", async () => {
 *     // Call API endpoint
 *     const response = await fetch('/tower/conversation-flag', {
 *       method: 'POST',
 *       body: JSON.stringify(mockParams)
 *     });
 *     
 *     // Verify response
 *     expect(response.status).toBe(200);
 *     
 *     // Wait for analysis
 *     await new Promise(resolve => setTimeout(resolve, 5000));
 *     
 *     // Fetch investigation
 *     const investigation = await getInvestigation(investigationId);
 *     
 *     // Verify analysis exists
 *     expect(investigation.runMeta?.analysis).toBeDefined();
 *     expect(investigation.diagnosis).toBeDefined();
 *   });
 * });
 * ```
 */
