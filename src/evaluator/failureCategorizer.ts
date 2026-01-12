import { db } from "../../lib/db";
import {
  failureCategories,
  categorizedFailures,
  failurePatterns,
  failureMemory,
  type FailureCategory,
  type CategorizedFailure,
  type FailurePattern,
  type FailurePatternRow,
  type FailureMemory,
  type FailureMemoryRow,
} from "../../shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

// Debug bridge error reporting
async function reportError(type: string, message: string, data: Record<string, any> = {}) {
  try {
    await fetch('http://localhost:9999/code-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        message,
        repo: 'Tower',
        timestamp: new Date().toISOString(),
        ...data
      })
    });
  } catch (err) {
    // Debug bridge offline - fail silently
  }
}

// ==================== CATEGORY MANAGEMENT ====================

export async function ensureDefaultCategories(): Promise<void> {
  try {
    const defaultCategories = [
      {
        name: "authentication",
        description: "Authentication and authorization failures",
        keywords: ["auth", "unauthorized", "forbidden", "401", "403", "token", "session", "permission", "credentials"],
        patterns: [".*unauthorized.*", ".*authentication.*failed.*", ".*invalid.*token.*", ".*permission.*denied.*"],
        recommendationTemplate: "Check authentication configuration, verify tokens are valid, and ensure proper permissions are set.",
        severity: "high",
      },
      {
        name: "timeout",
        description: "Request timeout and slow response issues",
        keywords: ["timeout", "ETIMEDOUT", "ECONNABORTED", "slow", "exceeded", "deadline"],
        patterns: [".*timeout.*", ".*ETIMEDOUT.*", ".*request.*too.*slow.*", ".*exceeded.*deadline.*"],
        recommendationTemplate: "Increase timeout values, optimize slow operations, or implement retry logic with exponential backoff.",
        severity: "medium",
      },
      {
        name: "data_validation",
        description: "Data validation and schema errors",
        keywords: ["validation", "invalid", "schema", "required", "missing", "format", "type", "constraint"],
        patterns: [".*validation.*error.*", ".*invalid.*data.*", ".*schema.*mismatch.*", ".*required.*field.*missing.*"],
        recommendationTemplate: "Review input validation rules, check data types, and ensure all required fields are provided.",
        severity: "medium",
      },
      {
        name: "logic_error",
        description: "Business logic and algorithmic errors",
        keywords: ["null", "undefined", "cannot read", "NaN", "infinity", "division", "logic", "assertion"],
        patterns: [".*cannot.*read.*property.*", ".*undefined.*is.*not.*", ".*null.*is.*not.*", ".*assertion.*failed.*"],
        recommendationTemplate: "Review business logic, add null checks, and ensure proper error handling in critical code paths.",
        severity: "high",
      },
      {
        name: "network",
        description: "Network connectivity and communication failures",
        keywords: ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "network", "connection", "socket", "dns"],
        patterns: [".*ECONNREFUSED.*", ".*ENOTFOUND.*", ".*network.*error.*", ".*connection.*refused.*"],
        recommendationTemplate: "Check network connectivity, verify service endpoints are accessible, and review firewall rules.",
        severity: "high",
      },
      {
        name: "rate_limit",
        description: "Rate limiting and quota exceeded errors",
        keywords: ["rate", "limit", "quota", "429", "throttle", "exceeded", "too many"],
        patterns: [".*rate.*limit.*exceeded.*", ".*too.*many.*requests.*", ".*quota.*exceeded.*", ".*429.*"],
        recommendationTemplate: "Implement request throttling, use caching where appropriate, or increase rate limits if possible.",
        severity: "medium",
      },
      {
        name: "resource",
        description: "Resource exhaustion (memory, disk, CPU)",
        keywords: ["memory", "heap", "ENOMEM", "disk", "space", "full", "resource", "exhausted"],
        patterns: [".*out.*of.*memory.*", ".*heap.*exhausted.*", ".*disk.*full.*", ".*resource.*limit.*"],
        recommendationTemplate: "Monitor resource usage, optimize memory consumption, clean up unused resources, or scale infrastructure.",
        severity: "critical",
      },
      {
        name: "database",
        description: "Database connection and query errors",
        keywords: ["database", "sql", "query", "connection", "deadlock", "duplicate", "constraint", "ECONNRESET"],
        patterns: [".*database.*error.*", ".*sql.*error.*", ".*deadlock.*", ".*duplicate.*key.*", ".*constraint.*violation.*"],
        recommendationTemplate: "Review database queries, check connection pool settings, and ensure proper transaction handling.",
        severity: "high",
      },
    ];

    for (const category of defaultCategories) {
      await db
        .insert(failureCategories)
        .values(category)
        .onConflictDoUpdate({
          target: failureCategories.name,
          set: {
            description: category.description,
            keywords: category.keywords,
            patterns: category.patterns,
            recommendationTemplate: category.recommendationTemplate,
            severity: category.severity,
            updatedAt: new Date(),
          },
        });
    }
  } catch (error: any) {
    await reportError('category-ensure-error', error.message, {});
    throw error;
  }
}

export async function getAllCategories(): Promise<FailureCategory[]> {
  try {
    return await db
      .select()
      .from(failureCategories)
      .orderBy(failureCategories.name);
  } catch (error: any) {
    await reportError('category-list-error', error.message, {});
    throw error;
  }
}

export async function getCategoryById(id: string): Promise<FailureCategory | null> {
  try {
    const rows = await db
      .select()
      .from(failureCategories)
      .where(eq(failureCategories.id, id))
      .limit(1);

    return rows[0] || null;
  } catch (error: any) {
    await reportError('category-get-error', error.message, { id });
    throw error;
  }
}

// ==================== FAILURE CLASSIFICATION ====================

/**
 * Classify a failure based on error message and stack trace
 * Uses keyword matching and regex patterns with confidence scoring
 */
export async function classifyFailure(params: {
  errorMessage: string;
  errorStack?: string;
  context?: Record<string, any>;
  runId?: string;
  investigationId?: string;
}): Promise<CategorizedFailure> {
  try {
    const categories = await getAllCategories();

    const errorText = `${params.errorMessage} ${params.errorStack || ""}`.toLowerCase();

    // Calculate confidence scores for each category
    const scores: Array<{ category: FailureCategory; score: number }> = [];

    for (const category of categories) {
      let score = 0;

      // Keyword matching (1 point per keyword)
      for (const keyword of category.keywords as string[]) {
        if (errorText.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // Pattern matching (5 points per pattern match)
      for (const pattern of category.patterns as string[]) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(errorText)) {
            score += 5;
          }
        } catch (err) {
          // Invalid regex, skip
        }
      }

      if (score > 0) {
        scores.push({ category, score });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Determine confidence level
    let confidence: string;
    let selectedCategory: FailureCategory;

    if (scores.length === 0) {
      // No matches, use "logic_error" as default
      const defaultCategory = categories.find(c => c.name === "logic_error");
      selectedCategory = defaultCategory || categories[0];
      confidence = "low";
    } else if (scores[0].score >= 5) {
      selectedCategory = scores[0].category;
      confidence = "high";
    } else if (scores[0].score >= 2) {
      selectedCategory = scores[0].category;
      confidence = "medium";
    } else {
      selectedCategory = scores[0].category;
      confidence = "low";
    }

    // Record the categorized failure
    const inserted = await db
      .insert(categorizedFailures)
      .values({
        categoryId: selectedCategory.id,
        runId: params.runId || null,
        investigationId: params.investigationId || null,
        errorMessage: params.errorMessage,
        errorStack: params.errorStack || null,
        context: params.context || null,
        confidence,
      })
      .returning();

    const categorized = inserted[0];

    // Update or create failure pattern
    await updateFailurePattern({
      categoryId: selectedCategory.id,
      errorMessage: params.errorMessage,
    });

    return categorized;
  } catch (error: any) {
    await reportError('failure-classify-error', error.message, { params });
    throw error;
  }
}

// ==================== PATTERN DETECTION ====================

async function updateFailurePattern(params: {
  categoryId: string;
  errorMessage: string;
}): Promise<void> {
  try {
    // Simplify error message to create a pattern
    const simplifiedError = simplifyErrorMessage(params.errorMessage);

    // Check if pattern exists
    const existingPatterns = await db
      .select()
      .from(failurePatterns)
      .where(
        and(
          eq(failurePatterns.categoryId, params.categoryId),
          eq(failurePatterns.name, simplifiedError)
        )
      )
      .limit(1);

    if (existingPatterns.length > 0) {
      // Update existing pattern
      const pattern = existingPatterns[0];
      const newOccurrences = parseInt(pattern.occurrences) + 1;
      const frequency = calculateFrequency(newOccurrences);

      await db
        .update(failurePatterns)
        .set({
          occurrences: newOccurrences.toString(),
          lastSeenAt: new Date(),
          frequency,
        })
        .where(eq(failurePatterns.id, pattern.id));
    } else {
      // Create new pattern
      await db
        .insert(failurePatterns)
        .values({
          name: simplifiedError,
          description: params.errorMessage,
          categoryId: params.categoryId,
          occurrences: "1",
          frequency: "low",
        });
    }
  } catch (error: any) {
    await reportError('pattern-update-error', error.message, { params });
    throw error;
  }
}

function simplifyErrorMessage(error: string): string {
  // Remove specific values, paths, and numbers to create a generalized pattern
  return error
    .replace(/\d+/g, 'N') // Replace numbers with N
    .replace(/\/[^\s]+/g, '/PATH') // Replace paths
    .replace(/["']([^"']+)["']/g, 'VALUE') // Replace quoted values
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID') // Replace UUIDs
    .substring(0, 200); // Limit length
}

function calculateFrequency(occurrences: number): string {
  if (occurrences >= 50) return "very_high";
  if (occurrences >= 20) return "high";
  if (occurrences >= 10) return "medium";
  if (occurrences >= 5) return "low";
  return "very_low";
}

export async function detectPatterns(categoryId?: string): Promise<FailurePattern[]> {
  try {
    let query = db
      .select()
      .from(failurePatterns)
      .orderBy(desc(failurePatterns.occurrences));

    if (categoryId) {
      query = query.where(eq(failurePatterns.categoryId, categoryId)) as any;
    }

    const rows = await query.limit(50);

    return rows.map(row => ({
      ...row,
      occurrences: parseInt(row.occurrences),
    }));
  } catch (error: any) {
    await reportError('pattern-detect-error', error.message, { categoryId });
    throw error;
  }
}

// ==================== RECOMMENDATION GENERATION ====================

export async function generateRecommendations(categoryId: string): Promise<{
  categoryRecommendation: string;
  patternRecommendations: string[];
  memorySolutions: FailureMemory[];
}> {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    // Get patterns for this category
    const patterns = await detectPatterns(categoryId);

    // Get memory solutions
    const memorySolutions = await getMemorySolutions(categoryId);

    // Generate pattern-specific recommendations
    const patternRecommendations = patterns
      .filter(p => p.frequency === 'high' || p.frequency === 'very_high')
      .map(p => {
        if (p.recommendation) {
          return p.recommendation;
        }
        return `Pattern "${p.name}" occurs frequently (${p.occurrences} times). Investigate and implement a permanent fix.`;
      })
      .slice(0, 5);

    return {
      categoryRecommendation: category.recommendationTemplate,
      patternRecommendations,
      memorySolutions,
    };
  } catch (error: any) {
    await reportError('recommendation-generate-error', error.message, { categoryId });
    throw error;
  }
}

// ==================== TREND TRACKING ====================

export async function getFailureTrends(params: {
  startDate?: Date;
  endDate?: Date;
  categoryId?: string;
}): Promise<{
  totalFailures: number;
  byCategory: Array<{ category: FailureCategory; count: number; percentage: number }>;
  byDay: Array<{ date: string; count: number }>;
  topPatterns: FailurePattern[];
}> {
  try {
    const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = params.endDate || new Date();

    // Get all failures in date range
    let failuresQuery = db
      .select()
      .from(categorizedFailures)
      .where(
        and(
          gte(categorizedFailures.detectedAt, startDate),
          sql`${categorizedFailures.detectedAt} <= ${endDate}`
        )
      );

    if (params.categoryId) {
      failuresQuery = failuresQuery.where(
        eq(categorizedFailures.categoryId, params.categoryId)
      ) as any;
    }

    const failures = await failuresQuery;
    const totalFailures = failures.length;

    // Group by category
    const categoryMap = new Map<string, number>();
    for (const failure of failures) {
      const count = categoryMap.get(failure.categoryId) || 0;
      categoryMap.set(failure.categoryId, count + 1);
    }

    const categories = await getAllCategories();
    const byCategory = Array.from(categoryMap.entries()).map(([categoryId, count]) => {
      const category = categories.find(c => c.id === categoryId);
      return {
        category: category!,
        count,
        percentage: (count / totalFailures) * 100,
      };
    }).sort((a, b) => b.count - a.count);

    // Group by day
    const dayMap = new Map<string, number>();
    for (const failure of failures) {
      const day = failure.detectedAt.toISOString().split('T')[0];
      const count = dayMap.get(day) || 0;
      dayMap.set(day, count + 1);
    }

    const byDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get top patterns
    const topPatterns = await detectPatterns(params.categoryId);

    return {
      totalFailures,
      byCategory,
      byDay,
      topPatterns: topPatterns.slice(0, 10),
    };
  } catch (error: any) {
    await reportError('trend-get-error', error.message, { params });
    throw error;
  }
}

// ==================== MEMORY SYSTEM INTEGRATION ====================

export async function recordSolution(params: {
  categoryId: string;
  patternId?: string;
  solution: string;
  successRate: number;
  metadata?: any;
}): Promise<FailureMemory> {
  try {
    const inserted = await db
      .insert(failureMemory)
      .values({
        categoryId: params.categoryId,
        patternId: params.patternId || null,
        solution: params.solution,
        successRate: params.successRate.toString(),
        timesApplied: "0",
        metadata: params.metadata || null,
      })
      .returning();

    const row = inserted[0];
    return {
      ...row,
      successRate: parseFloat(row.successRate),
      timesApplied: parseInt(row.timesApplied),
    };
  } catch (error: any) {
    await reportError('solution-record-error', error.message, { params });
    throw error;
  }
}

export async function applySolution(solutionId: string): Promise<void> {
  try {
    const solutions = await db
      .select()
      .from(failureMemory)
      .where(eq(failureMemory.id, solutionId))
      .limit(1);

    if (solutions.length === 0) {
      throw new Error(`Solution not found: ${solutionId}`);
    }

    const solution = solutions[0];
    const newTimesApplied = parseInt(solution.timesApplied) + 1;

    await db
      .update(failureMemory)
      .set({
        timesApplied: newTimesApplied.toString(),
        lastAppliedAt: new Date(),
      })
      .where(eq(failureMemory.id, solutionId));
  } catch (error: any) {
    await reportError('solution-apply-error', error.message, { solutionId });
    throw error;
  }
}

export async function getMemorySolutions(categoryId: string, limit: number = 10): Promise<FailureMemory[]> {
  try {
    const rows = await db
      .select()
      .from(failureMemory)
      .where(eq(failureMemory.categoryId, categoryId))
      .orderBy(desc(failureMemory.successRate))
      .limit(limit);

    return rows.map(row => ({
      ...row,
      successRate: parseFloat(row.successRate),
      timesApplied: parseInt(row.timesApplied),
    }));
  } catch (error: any) {
    await reportError('memory-solutions-get-error', error.message, { categoryId });
    throw error;
  }
}

// ==================== UTILITY FUNCTIONS ====================

export async function getCategorizedFailures(params: {
  categoryId?: string;
  limit?: number;
}): Promise<CategorizedFailure[]> {
  try {
    let query = db
      .select()
      .from(categorizedFailures)
      .orderBy(desc(categorizedFailures.detectedAt));

    if (params.categoryId) {
      query = query.where(eq(categorizedFailures.categoryId, params.categoryId)) as any;
    }

    return await query.limit(params.limit || 100);
  } catch (error: any) {
    await reportError('categorized-failures-get-error', error.message, { params });
    throw error;
  }
}

export async function markFailureResolved(
  failureId: string,
  resolution: string
): Promise<CategorizedFailure> {
  try {
    const updated = await db
      .update(categorizedFailures)
      .set({
        resolution,
        resolvedAt: new Date(),
      })
      .where(eq(categorizedFailures.id, failureId))
      .returning();

    return updated[0];
  } catch (error: any) {
    await reportError('failure-resolve-error', error.message, { failureId, resolution });
    throw error;
  }
}
