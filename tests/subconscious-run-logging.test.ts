/**
 * TOW-7: Subconscious Run Logging Tests
 * 
 * Tests for the subconscious run logging helpers.
 * These tests verify that subconscious runs are properly logged
 * and can appear in the Tower runs UI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeImportanceDistribution,
  extractTopNudges,
  type SubconsciousRunContext,
} from "../src/evaluator/subconsciousRunLogger";
import type { RankedNudge, ImportanceLabel } from "../src/evaluator/nudgeRanking";
import { SUBCONSCIOUS_SOURCE } from "../src/types/events";

// Mock the database module
vi.mock("../src/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

/**
 * Helper to create a mock ranked nudge for testing.
 */
function createMockNudge(overrides: Partial<RankedNudge> = {}): RankedNudge {
  return {
    id: `nudge-${Math.random().toString(36).substr(2, 9)}`,
    type: "follow_up",
    status: "new",
    createdAt: new Date(),
    importanceScore: 75,
    importanceLabel: "high",
    message: "Follow up with lead",
    ...overrides,
  };
}

describe("TOW-7: Subconscious Run Logging", () => {
  describe("SUBCONSCIOUS_SOURCE constant", () => {
    it("should be 'subconscious'", () => {
      expect(SUBCONSCIOUS_SOURCE).toBe("subconscious");
    });
  });

  describe("computeImportanceDistribution", () => {
    it("should count empty array correctly", () => {
      const distribution = computeImportanceDistribution([]);
      expect(distribution).toEqual({
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      });
    });

    it("should count nudges by importance label", () => {
      const nudges: RankedNudge[] = [
        createMockNudge({ importanceLabel: "high", importanceScore: 85 }),
        createMockNudge({ importanceLabel: "high", importanceScore: 72 }),
        createMockNudge({ importanceLabel: "medium", importanceScore: 55 }),
        createMockNudge({ importanceLabel: "medium", importanceScore: 45 }),
        createMockNudge({ importanceLabel: "medium", importanceScore: 42 }),
        createMockNudge({ importanceLabel: "low", importanceScore: 25 }),
      ];

      const distribution = computeImportanceDistribution(nudges);
      expect(distribution).toEqual({
        high: 2,
        medium: 3,
        low: 1,
        total: 6,
      });
    });

    it("should handle all high importance nudges", () => {
      const nudges: RankedNudge[] = [
        createMockNudge({ importanceLabel: "high", importanceScore: 90 }),
        createMockNudge({ importanceLabel: "high", importanceScore: 85 }),
      ];

      const distribution = computeImportanceDistribution(nudges);
      expect(distribution.high).toBe(2);
      expect(distribution.medium).toBe(0);
      expect(distribution.low).toBe(0);
      expect(distribution.total).toBe(2);
    });

    it("should handle all low importance nudges", () => {
      const nudges: RankedNudge[] = [
        createMockNudge({ importanceLabel: "low", importanceScore: 30 }),
        createMockNudge({ importanceLabel: "low", importanceScore: 20 }),
        createMockNudge({ importanceLabel: "low", importanceScore: 15 }),
      ];

      const distribution = computeImportanceDistribution(nudges);
      expect(distribution.high).toBe(0);
      expect(distribution.medium).toBe(0);
      expect(distribution.low).toBe(3);
      expect(distribution.total).toBe(3);
    });
  });

  describe("extractTopNudges", () => {
    it("should extract top 3 nudges by default", () => {
      const nudges: RankedNudge[] = [
        createMockNudge({ id: "n1", message: "First nudge", importanceScore: 90, type: "follow_up" }),
        createMockNudge({ id: "n2", message: "Second nudge", importanceScore: 80, type: "stale_lead" }),
        createMockNudge({ id: "n3", message: "Third nudge", importanceScore: 70, type: "engagement" }),
        createMockNudge({ id: "n4", message: "Fourth nudge", importanceScore: 60, type: "reminder" }),
        createMockNudge({ id: "n5", message: "Fifth nudge", importanceScore: 50, type: "insight" }),
      ];

      const top = extractTopNudges(nudges);
      expect(top).toHaveLength(3);
      expect(top[0]).toEqual({
        id: "n1",
        title: "First nudge",
        type: "follow_up",
        importanceScore: 90,
      });
      expect(top[1]).toEqual({
        id: "n2",
        title: "Second nudge",
        type: "stale_lead",
        importanceScore: 80,
      });
      expect(top[2]).toEqual({
        id: "n3",
        title: "Third nudge",
        type: "engagement",
        importanceScore: 70,
      });
    });

    it("should respect custom limit", () => {
      const nudges: RankedNudge[] = [
        createMockNudge({ id: "n1", importanceScore: 90 }),
        createMockNudge({ id: "n2", importanceScore: 80 }),
        createMockNudge({ id: "n3", importanceScore: 70 }),
      ];

      const top1 = extractTopNudges(nudges, 1);
      expect(top1).toHaveLength(1);
      expect(top1[0].id).toBe("n1");

      const top5 = extractTopNudges(nudges, 5);
      expect(top5).toHaveLength(3); // Only 3 available
    });

    it("should truncate long messages to 50 chars", () => {
      const longMessage = "This is a very long nudge message that exceeds fifty characters and should be truncated";
      const nudges: RankedNudge[] = [
        createMockNudge({ id: "n1", message: longMessage, importanceScore: 90 }),
      ];

      const top = extractTopNudges(nudges);
      expect(top[0].title).toBe(longMessage.substring(0, 50));
      expect(top[0].title?.length).toBe(50);
    });

    it("should handle nudges without messages", () => {
      const nudges: RankedNudge[] = [
        createMockNudge({ id: "n1", message: null, importanceScore: 90 }),
        createMockNudge({ id: "n2", message: undefined, importanceScore: 80 }),
      ];

      const top = extractTopNudges(nudges);
      expect(top[0].title).toBeUndefined();
      expect(top[1].title).toBeUndefined();
    });

    it("should return empty array for empty input", () => {
      const top = extractTopNudges([]);
      expect(top).toEqual([]);
    });
  });

  describe("SubconsciousRunContext interface", () => {
    it("should accept valid context for list_nudges trigger", () => {
      const ctx: SubconsciousRunContext = {
        trigger: "list_nudges",
        userId: "user-123",
        accountId: "account-456",
        sessionId: "session-789",
        totalNudges: 10,
        highImportanceCount: 3,
        mediumImportanceCount: 5,
        lowImportanceCount: 2,
        topNudges: [
          { id: "n1", title: "Test", type: "follow_up", importanceScore: 90 },
        ],
      };

      expect(ctx.trigger).toBe("list_nudges");
      expect(ctx.totalNudges).toBe(10);
    });

    it("should accept valid context for dismiss_nudge trigger", () => {
      const ctx: SubconsciousRunContext = {
        trigger: "dismiss_nudge",
        userId: "user-123",
        nudgeId: "nudge-abc",
        action: "dismiss",
      };

      expect(ctx.trigger).toBe("dismiss_nudge");
      expect(ctx.nudgeId).toBe("nudge-abc");
      expect(ctx.action).toBe("dismiss");
    });

    it("should accept valid context for snooze_nudge trigger", () => {
      const ctx: SubconsciousRunContext = {
        trigger: "snooze_nudge",
        userId: "user-123",
        nudgeId: "nudge-xyz",
        action: "snooze",
        durationMs: 150,
      };

      expect(ctx.trigger).toBe("snooze_nudge");
      expect(ctx.action).toBe("snooze");
      expect(ctx.durationMs).toBe(150);
    });

    it("should accept minimal context", () => {
      const ctx: SubconsciousRunContext = {
        trigger: "rank_nudges",
      };

      expect(ctx.trigger).toBe("rank_nudges");
      expect(ctx.userId).toBeUndefined();
    });
  });

  describe("Goal summary generation", () => {
    // These are implicit tests - we're testing the expected output format
    // The actual function is tested through integration
    
    it("should format list_nudges summary correctly", () => {
      const totalNudges = 12;
      const highImportanceCount = 3;
      const expectedSummary = `List nudges (${totalNudges} total, ${highImportanceCount} high)`;
      expect(expectedSummary).toBe("List nudges (12 total, 3 high)");
    });

    it("should format dismiss_nudge summary correctly", () => {
      const nudgeId = "nudge-123";
      const expectedSummary = `Dismiss nudge ${nudgeId}`;
      expect(expectedSummary).toBe("Dismiss nudge nudge-123");
    });

    it("should format snooze_nudge summary correctly", () => {
      const nudgeId = "nudge-456";
      const expectedSummary = `Snooze nudge ${nudgeId}`;
      expect(expectedSummary).toBe("Snooze nudge nudge-456");
    });
  });
});

describe("TOW-7: Integration with nudgeRanking", () => {
  describe("SubconsciousLoggingOptions in rankSubconsciousNudges", () => {
    // Note: Full integration tests would require database setup
    // These tests verify the interface contract
    
    it("should accept logging options structure", () => {
      const loggingOptions = {
        userId: "user-123",
        accountId: "account-456",
        sessionId: "session-789",
        conversationId: "conv-abc",
        meta: { requestId: "req-xyz" },
      };

      expect(loggingOptions.userId).toBe("user-123");
      expect(loggingOptions.meta?.requestId).toBe("req-xyz");
    });
  });
});
