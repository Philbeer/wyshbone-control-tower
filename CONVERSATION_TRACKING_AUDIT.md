# Wyshbone Control Tower - Conversation Tracking System Audit
**Generated:** November 17, 2025  
**Purpose:** Complete source code audit for conversation-level run tracking feature

---

## Table of Contents

### A. Database Schema
1. [shared/schema.ts](#file-1-sharedschema)

### B. Server Ingestion & Storage
2. [src/evaluator/runLogger.ts](#file-2-srcevaluatorrunlogger)
3. [src/evaluator/runStore.ts](#file-3-srcevaluatorrunstore)

### C. Types & Interfaces
4. [src/evaluator/types.ts](#file-4-srcevaluatortypes)
5. [src/evaluator/chatApiTypes.ts](#file-5-srcevaluatorchatapiTypes)

### D. API Routes (Tower Endpoints)
6. [server/index.ts](#file-6-serverindex)
7. [server/routes-manual-flags.ts](#file-7-serverroutes-manual-flags)
8. [server/routes-investigate-run.ts](#file-8-serverroutes-investigate-run)
9. [server.js (Main Server)](#file-9-serverjs-excerpt)

### E. Database Connection
10. [src/lib/db.ts](#file-10-srclibdb)

### F. React Components - Core Features
11. [client/src/components/RecentRunsSimple.tsx](#file-11-clientsrccomponentsrecentrunssimple)
12. [client/src/components/ManualFlagsCard.tsx](#file-12-clientsrccomponentsmanualflagscard)
13. [client/src/components/AutoFlaggedCard.tsx](#file-13-clientsrccomponentsautoflaggedcard)

### G. React Pages
14. [client/src/pages/status-dashboard.tsx](#file-14-clientsrcpagesstatus-dashboard)
15. [client/src/pages/conversation-timeline.tsx](#file-15-clientsrcpagesconversation-timeline)
16. [client/src/App.tsx](#file-16-clientsrcapp)

### H. React Utilities
17. [client/src/lib/queryClient.ts](#file-17-clientsrclibqueryclient)

### I. Documentation
18. [replit.md](#file-18-replitmd)

---

## A. DATABASE SCHEMA

### File 1: shared/schema.ts

```typescript
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const investigations = pgTable("investigations", {
  id: varchar("id").primaryKey(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  trigger: text("trigger").notNull(),
  run_id: text("run_id"),
  notes: text("notes"),
  run_logs: jsonb("run_logs").notNull().$type<any[]>(),
  run_meta: jsonb("run_meta").$type<{
    userId?: string;
    sessionId?: string;
    agent?: "ui" | "supervisor" | "tower";
    description?: string;
  }>(),
  ui_snapshot: jsonb("ui_snapshot"),
  supervisor_snapshot: jsonb("supervisor_snapshot"),
  diagnosis: text("diagnosis"),
  patch_suggestion: text("patch_suggestion"),
});

export const insertInvestigationSchema = createInsertSchema(investigations);
export type InsertInvestigation = z.infer<typeof insertInvestigationSchema>;
export type Investigation = typeof investigations.$inferSelect;

export const runs = pgTable("runs", {
  id: varchar("id").primaryKey(),
  conversation_run_id: text("conversation_run_id"),  // 🔥 NEW: Groups events by conversation
  created_at: timestamp("created_at").notNull().defaultNow(),
  source: text("source").notNull(),
  user_identifier: text("user_identifier"),
  goal_summary: text("goal_summary"),
  status: text("status").notNull().default("completed"),
  meta: jsonb("meta").$type<{
    duration?: number;
    toolsUsed?: string[];
    tokensUsed?: number;
    [key: string]: any;
  }>(),
});

export const insertRunSchema = createInsertSchema(runs);
export type InsertRun = z.infer<typeof insertRunSchema>;
export type Run = typeof runs.$inferSelect;

export const behaviourTests = pgTable("behaviour_tests", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  isActive: text("is_active").notNull().default("true"),
});

export const insertBehaviourTestSchema = createInsertSchema(behaviourTests);
export type InsertBehaviourTest = z.infer<typeof insertBehaviourTestSchema>;
export type BehaviourTestRow = typeof behaviourTests.$inferSelect;
export type BehaviourTest = Omit<BehaviourTestRow, 'isActive'> & {
  isActive: boolean;
};

export const behaviourTestRuns = pgTable("behaviour_test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  testId: text("test_id").notNull(),
  status: text("status").notNull(),
  details: text("details"),
  rawLog: jsonb("raw_log"),
  buildTag: text("build_tag"),
  durationMs: text("duration_ms"),
});

export const insertBehaviourTestRunSchema = createInsertSchema(behaviourTestRuns);
export type InsertBehaviourTestRun = z.infer<typeof insertBehaviourTestRunSchema>;
export type BehaviourTestRunRow = typeof behaviourTestRuns.$inferSelect;
export type BehaviourTestRun = Omit<BehaviourTestRunRow, 'durationMs'> & {
  durationMs: number | null;
};

export const patchEvaluations = pgTable("patch_evaluations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  status: text("status").notNull(),
  patchText: text("patch_text").notNull(),
  diff: jsonb("diff"),
  reasons: jsonb("reasons").$type<string[]>(),
  testResultsBefore: jsonb("test_results_before"),
  testResultsAfter: jsonb("test_results_after"),
  investigationIds: jsonb("investigation_ids").$type<string[]>(),
  evaluationMeta: jsonb("evaluation_meta").$type<{
    latencyRegressions?: Array<{ testId: string; before: number; after: number; increase: number }>;
    qualityFlags?: string[];
    autoDetectTriggers?: string[];
    [key: string]: any;
  }>(),
});

export const insertPatchEvaluationSchema = createInsertSchema(patchEvaluations);
export type InsertPatchEvaluation = z.infer<typeof insertPatchEvaluationSchema>;
export type PatchEvaluation = typeof patchEvaluations.$inferSelect;

export const patchSuggestions = pgTable("patch_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investigationId: varchar("investigation_id").notNull(),
  runId: varchar("run_id"),
  source: text("source").notNull().default("agent"),
  patchText: text("patch_text").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("suggested"),
  patchEvaluationId: varchar("patch_evaluation_id"),
  externalLink: text("external_link"),
  meta: jsonb("meta").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPatchSuggestionSchema = createInsertSchema(patchSuggestions);
export type InsertPatchSuggestion = z.infer<typeof insertPatchSuggestionSchema>;
export type PatchSuggestion = typeof patchSuggestions.$inferSelect;
```

---

## B. SERVER INGESTION & STORAGE

### File 2: src/evaluator/runLogger.ts

```typescript
import { db } from "../lib/db";
import { behaviourTestRuns, type BehaviourTestRun } from "../../shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import type { BehaviourTestResult } from "./behaviourTests";

export async function getLastRunForTest(testId: string): Promise<BehaviourTestRun | null> {
  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .where(eq(behaviourTestRuns.testId, testId))
    .orderBy(desc(behaviourTestRuns.createdAt))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    ...row,
    durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
  };
}

export async function getRecentErrorsForTest(
  testId: string,
  withinMinutes: number = 5
): Promise<BehaviourTestRun[]> {
  const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000);
  
  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .where(
      and(
        eq(behaviourTestRuns.testId, testId),
        gte(behaviourTestRuns.createdAt, cutoffTime)
      )
    )
    .orderBy(desc(behaviourTestRuns.createdAt));

  return rows
    .filter(row => row.status === 'error' || row.status === 'fail')
    .map(row => ({
      ...row,
      durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
    }));
}

export async function getPreviousRunForTest(
  testId: string,
  beforeRunId: string
): Promise<BehaviourTestRun | null> {
  const currentRun = await db.query.behaviourTestRuns.findFirst({
    where: eq(behaviourTestRuns.id, beforeRunId),
  });

  if (!currentRun) {
    return null;
  }

  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .where(
      and(
        eq(behaviourTestRuns.testId, testId),
        // Get runs before the current one
      )
    )
    .orderBy(desc(behaviourTestRuns.createdAt))
    .limit(10);

  // Filter to runs that happened before current run
  const previousRuns = rows.filter(
    r => r.createdAt < currentRun.createdAt && r.id !== beforeRunId
  );

  if (previousRuns.length === 0) {
    return null;
  }

  const row = previousRuns[0];
  return {
    ...row,
    durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
  };
}
```

### File 3: src/evaluator/runStore.ts

```typescript
import { db } from "../lib/db";
import { runs } from "../../shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export type RunSummary = {
  id: string;
  created_at: string;
  source: "UI" | "SUP" | "live_user" | string;
  user_identifier?: string | null;
  goal_summary?: string | null;
  status: string;
  meta?: any;
};

export async function listRecentRuns(limit = 20): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.created_at))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at.toISOString(),
    source: r.source,
    user_identifier: r.user_identifier ?? null,
    goal_summary: r.goal_summary ?? null,
    status: r.status,
    meta: r.meta ?? undefined,
  }));
}

export async function listLiveUserRuns(limit = 20): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.source, "live_user"))
    .orderBy(desc(runs.created_at))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at.toISOString(),
    source: r.source,
    user_identifier: r.user_identifier ?? null,
    goal_summary: r.goal_summary ?? null,
    status: r.status,
    meta: r.meta ?? undefined,
  }));
}

export async function getRunById(id: string): Promise<RunSummary | null> {
  const row = await db.query.runs.findFirst({
    where: eq(runs.id, id),
  });

  if (!row) return null;

  return {
    id: row.id,
    created_at: row.created_at.toISOString(),
    source: row.source,
    user_identifier: row.user_identifier ?? null,
    goal_summary: row.goal_summary ?? null,
    status: row.status,
    meta: row.meta ?? undefined,
  };
}

export async function createRun(data: {
  id: string;
  source: string;
  userIdentifier?: string;
  goalSummary?: string;
  status?: string;
  meta?: any;
}): Promise<void> {
  await db.insert(runs).values({
    id: data.id,
    source: data.source,
    user_identifier: data.userIdentifier ?? null,
    goal_summary: data.goalSummary ?? null,
    status: data.status ?? "completed",
    meta: data.meta ?? null,
  });
}

export type LiveUserRunPayload = {
  runId?: string;
  source: string;
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
  request?: {
    inputText?: string;
    toolCalls?: Array<{ name: string; args?: any }>;
  };
  response?: {
    outputText?: string;
    toolResultsSummary?: string | null;
  };
  status: "success" | "error" | "timeout" | "fail";
  goal?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs: number;
  model?: string;
  mode?: string;
  meta?: Record<string, any>;
};

// 🔥 CORE INGESTION FUNCTION: Creates individual events and groups them by conversation
export async function createLiveUserRun(
  payload: LiveUserRunPayload
): Promise<{ id: string; conversationRunId: string; status: string }> {
  // Extract or generate conversation ID from payload
  const conversationRunId = payload.runId || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const eventId = `${conversationRunId}-evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  
  const inputText = payload.request?.inputText || "";
  const outputText = payload.response?.outputText || "";
  
  // Validate and safely parse startedAt timestamp
  let createdAt: Date;
  if (payload.startedAt && 
      typeof payload.startedAt === 'number' && 
      Number.isFinite(payload.startedAt)) {
    const parsedDate = new Date(payload.startedAt);
    createdAt = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  } else {
    createdAt = new Date();
  }
  
  console.log("📥 Tower run log received", {
    eventId,
    conversationRunId,
    source: payload.source,
    createdAt: createdAt.toISOString(),
    hasInput: !!inputText,
    hasOutput: !!outputText,
    status: payload.status,
    durationMs: payload.durationMs,
  });
  
  const goalSummary = payload.goal || 
                      (inputText ? inputText.substring(0, 200) : null);
  
  await db.insert(runs).values({
    id: eventId,
    conversation_run_id: conversationRunId,  // 🔥 Store conversation grouping ID
    source: payload.source ?? "live_user",
    user_identifier: payload.userId ?? payload.userEmail ?? null,
    goal_summary: goalSummary,
    status: payload.status,
    created_at: createdAt,
    meta: {
      sessionId: payload.sessionId,
      requestText: inputText || undefined,
      responseText: outputText || undefined,
      output: outputText || undefined,
      inputText: inputText || undefined,
      toolCalls: payload.request?.toolCalls,
      toolResultsSummary: payload.response?.toolResultsSummary,
      durationMs: payload.durationMs,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
      model: payload.model,
      mode: payload.mode,
      ...payload.meta,
    },
  });

  return { id: eventId, conversationRunId, status: payload.status };
}

// 🔥 NEW: Conversation summary interface
export interface ConversationSummary {
  conversation_run_id: string;
  first_event_time: string;
  latest_event_time: string;
  event_count: number;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  source: string;
  user_identifier: string | null;
}

// 🔥 NEW: List conversations grouped by conversation_run_id
export async function listConversations(limit = 50): Promise<ConversationSummary[]> {
  const conversationGroups = await db
    .select({
      conversation_run_id: runs.conversation_run_id,
      first_event_time: sql<string>`MIN(${runs.created_at})`,
      latest_event_time: sql<string>`MAX(${runs.created_at})`,
      event_count: sql<number>`COUNT(*)`,
      latest_status: sql<string>`(ARRAY_AGG(${runs.status} ORDER BY ${runs.created_at} DESC))[1]`,
      first_input: sql<string>`(ARRAY_AGG(${runs.goal_summary} ORDER BY ${runs.created_at} ASC) FILTER (WHERE ${runs.goal_summary} IS NOT NULL))[1]`,
      latest_output: sql<string>`(ARRAY_AGG(${runs.meta} ORDER BY ${runs.created_at} DESC))[1]`,
      source: sql<string>`(ARRAY_AGG(${runs.source} ORDER BY ${runs.created_at} ASC))[1]`,
      user_identifier: sql<string>`(ARRAY_AGG(${runs.user_identifier} ORDER BY ${runs.created_at} ASC) FILTER (WHERE ${runs.user_identifier} IS NOT NULL))[1]`,
    })
    .from(runs)
    .where(sql`${runs.conversation_run_id} IS NOT NULL`)
    .groupBy(runs.conversation_run_id)
    .orderBy(sql`MAX(${runs.created_at}) DESC`)
    .limit(limit);

  return conversationGroups.map((group) => {
    const latestMeta = group.latest_output as any || {};
    const outputText = latestMeta.responseText || latestMeta.outputText || latestMeta.output || "";
    const outputSummary = outputText ? outputText.substring(0, 160) : null;

    return {
      conversation_run_id: group.conversation_run_id || "",
      first_event_time: group.first_event_time,
      latest_event_time: group.latest_event_time,
      event_count: Number(group.event_count),
      status: group.latest_status || "unknown",
      input_summary: group.first_input,
      output_summary: outputSummary,
      source: group.source || "unknown",
      user_identifier: group.user_identifier || null,
    };
  });
}

// 🔥 NEW: Get all events for a specific conversation
export async function getConversationEvents(conversationRunId: string): Promise<RunSummary[]> {
  const events = await db
    .select()
    .from(runs)
    .where(eq(runs.conversation_run_id, conversationRunId))
    .orderBy(sql`${runs.created_at} ASC`);

  return events.map((r) => ({
    id: r.id,
    created_at: r.created_at.toISOString(),
    source: r.source,
    user_identifier: r.user_identifier ?? null,
    goal_summary: r.goal_summary ?? null,
    status: r.status,
    meta: r.meta ?? undefined,
  }));
}
```

---

## C. TYPES & INTERFACES

### File 4: src/evaluator/types.ts

```typescript
export type InvestigationTrigger =
  | "manual"
  | "manual-from-run"
  | "timeout"
  | "tool_error"
  | "behaviour_flag"
  | "conversation_quality"
  | "auto_conversation_quality"
  | "patch_failure";

export interface ConversationQualityAnalysis {
  failure_category: "prompt_issue" | "decision_logic_issue" | "missing_behaviour_test" | "missing_clarification_logic" | "unclear_or_ambiguous_user_input";
  summary: string;
  repro_scenario: string;
  suggested_prompt_changes?: string;
  suggested_behaviour_test?: string;
}

export interface ConversationQualityMeta {
  source: "conversation_quality";
  focus: {
    kind: "conversation";
  };
  sessionId: string;
  userId?: string | null;
  flagged_message_index: number;
  conversation_window: any[];
  user_note?: string;
  analysis?: ConversationQualityAnalysis;
}

export interface WyshboneConversationAnalysis {
  failure_type: "greeting_flow" | "domain_followup" | "misinterpreted_intent" | "repetition" | "dead_end" | "other";
  severity: "low" | "medium" | "high";
  summary: string;
  user_intent: string;
  expected_behaviour: string;
  actual_behaviour: string;
  suggested_fix: string;
  suggested_tests: string[];
}

export interface AutoConversationQualityMeta {
  source: "auto_conversation_quality";
  focus: {
    kind: "conversation";
  };
  runId: string;
  sessionId?: string;
  userId?: string | null;
  conversation_transcript: any[];
  analysis?: WyshboneConversationAnalysis;
}

export interface PatchFailureAnalysis {
  failure_reason: string;
  failure_category: "broke_existing_tests" | "did_not_fix_original_issue" | "misinterpreted_requirement" | "test_is_ambiguous_or_wrong" | "wrong_repo_or_layer" | "insufficient_context" | "other";
  next_step: string;
  suggested_constraints_for_next_patch?: string;
}

export interface PatchFailureMeta {
  source: "patch_failure";
  focus: {
    kind: "patch";
  };
  original_investigation_id: string;
  patch_id: string;
  patch_diff: string;
  sandbox_result: {
    status: "rejected";
    reasons: string[];
    riskLevel?: string;
    testResultsBefore?: any[];
    testResultsAfter?: any[];
    diff?: any;
  };
  analysis?: PatchFailureAnalysis;
}

export interface Investigation {
  id: string;
  createdAt: Date;
  trigger: InvestigationTrigger;
  runId?: string;
  notes?: string;

  runLogs: any[];
  runMeta?: {
    userId?: string;
    sessionId?: string;
    agent?: "ui" | "supervisor" | "tower";
    description?: string;
    source?: string;
    focus?: {
      kind?: string;
      testId?: string;
      testName?: string;
    };
    [key: string]: any;
  };

  uiSnapshot?: any | null;
  supervisorSnapshot?: any | null;

  diagnosis?: string | null;
  patchSuggestion?: string | null;
}

export interface SnapshotBundle {
  uiSnapshot?: any | null;
  supervisorSnapshot?: any | null;
}

export interface DiagnosticResult {
  diagnosis: string;
  patchSuggestion: string;
}
```

### File 5: src/evaluator/chatApiTypes.ts

```typescript
/**
 * Type definitions for Wyshbone UI chat API requests
 * Discovered through iterative testing of /api/chat endpoint
 */

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  domain?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  user: ChatUser;
  messages: ChatMessage[];
  sessionId?: string;
  goal?: string;
}

export interface ChatResponse {
  message?: string;
  response?: string;
  [key: string]: any;
}
```

---

## D. API ROUTES (TOWER ENDPOINTS)

### File 6: server/index.ts

```typescript
// Wyshbone Status Dashboard - Main Entry Point
// This replaces the fullstack template to run the standalone dashboard

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import and run the dashboard server
const { execSync } = require('child_process');
const path = require('path');

// The dashboard is in server.js at the project root
const dashboardPath = path.join(process.cwd(), 'server.js');

console.log('🚀 Starting Wyshbone Status Dashboard...');
console.log(`📁 Dashboard location: ${dashboardPath}`);

// Execute the dashboard server using tsx to support TypeScript imports
try {
  execSync(`npx tsx ${dashboardPath}`, { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to start dashboard:', error);
  process.exit(1);
}
```

### File 7: server/routes-manual-flags.ts

```typescript
import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations, runs } from "@shared/schema";
import { and, eq, gte } from "drizzle-orm";

const router = Router();

// POST /tower/runs/:id/flag - Flag a run manually (legacy single-run flagging)
router.post("/runs/:id/flag", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Fetch the run
    const run = await db.query.runs.findFirst({
      where: eq(runs.id, id),
    });

    if (!run) {
      return res.status(404).json({ error: "Run not found" });
    }

    // Check for existing manual flag within 24 hours
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await db.query.investigations.findFirst({
      where: and(
        gte(investigations.created_at, windowStart),
        eq(investigations.run_id, id),
        eq(investigations.trigger, "manual_flag")
      ),
    });

    if (existing) {
      // Update existing investigation with new reason if provided
      const updatedNotes = `${existing.notes || ""}\n\n[${new Date().toISOString()}] Updated manual flag${reason ? `: ${reason}` : ""}`;
      
      await db
        .update(investigations)
        .set({ notes: updatedNotes })
        .where(eq(investigations.id, existing.id));

      return res.json({
        investigation_id: existing.id,
        status: "updated",
        message: "Existing manual flag updated",
      });
    }

    // Create new manual flag investigation
    const investigationId = `manual-${id}-${Date.now()}`;
    const investigation = {
      id: investigationId,
      trigger: "manual_flag",
      run_id: id,
      notes: reason || "Manually flagged for review",
      run_logs: [],
      run_meta: {
        userId: run.user_identifier || undefined,
        source: "manual_flag",
        flagged_at: new Date().toISOString(),
        original_source: run.source,
        goal_summary: run.goal_summary,
        status: run.status,
      } as any,
    };

    await db.insert(investigations).values([investigation]);

    console.log(`[ManualFlags] Created manual flag investigation ${investigationId} for run ${id}`);

    res.json({
      investigation_id: investigationId,
      status: "created",
      message: "Run flagged successfully",
    });
  } catch (error: any) {
    console.error("[ManualFlags] Error flagging run:", error);
    res.status(500).json({
      error: "Failed to flag run",
      details: error.message,
    });
  }
});

// 🔥 NEW: POST /tower/conversations/:conversationRunId/flag - Flag entire conversation
router.post("/conversations/:conversationRunId/flag", async (req, res) => {
  try {
    const { conversationRunId } = req.params;
    const { reason } = req.body;

    // Fetch all runs in this conversation
    const conversationRuns = await db.query.runs.findMany({
      where: eq(runs.conversation_run_id, conversationRunId),
      orderBy: (r, { asc }) => [asc(r.created_at)],
    });

    if (!conversationRuns || conversationRuns.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const firstRun = conversationRuns[0];

    // Check for existing manual flag within 24 hours for this conversation
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await db.query.investigations.findFirst({
      where: and(
        gte(investigations.created_at, windowStart),
        eq(investigations.run_id, conversationRunId),
        eq(investigations.trigger, "manual_flag")
      ),
    });

    if (existing) {
      // Update existing investigation with new reason if provided
      const updatedNotes = `${existing.notes || ""}\n\n[${new Date().toISOString()}] Updated manual flag${reason ? `: ${reason}` : ""}`;
      
      await db
        .update(investigations)
        .set({ notes: updatedNotes })
        .where(eq(investigations.id, existing.id));

      return res.json({
        investigation_id: existing.id,
        status: "updated",
        message: "Existing manual flag updated",
      });
    }

    // Create new manual flag investigation for the conversation
    const investigationId = `manual-conv-${conversationRunId}-${Date.now()}`;
    const investigation = {
      id: investigationId,
      trigger: "manual_flag",
      run_id: conversationRunId,  // Store conversation ID in run_id
      notes: reason || "Manually flagged conversation for review",
      run_logs: [],
      run_meta: {
        userId: firstRun.user_identifier || undefined,
        source: "manual_flag",
        flagged_at: new Date().toISOString(),
        original_source: firstRun.source,
        goal_summary: firstRun.goal_summary,
        status: firstRun.status,
        conversation_run_id: conversationRunId,
        event_count: conversationRuns.length,  // Track how many messages in conversation
      } as any,
    };

    await db.insert(investigations).values([investigation]);

    console.log(`[ManualFlags] Created manual flag investigation ${investigationId} for conversation ${conversationRunId} (${conversationRuns.length} events)`);

    res.json({
      investigation_id: investigationId,
      status: "created",
      message: "Conversation flagged successfully",
    });
  } catch (error: any) {
    console.error("[ManualFlags] Error flagging conversation:", error);
    res.status(500).json({
      error: "Failed to flag conversation",
      details: error.message,
    });
  }
});

// GET /tower/manual-flags - Get all manually flagged runs
router.get("/manual-flags", async (req, res) => {
  try {
    console.log("[ManualFlags] Fetching all manual flag investigations");

    const manualFlags = await db.query.investigations.findMany({
      where: eq(investigations.trigger, "manual_flag"),
      orderBy: (inv, { desc }) => [desc(inv.created_at)],
    });

    console.log(`[ManualFlags] Found ${manualFlags.length} manual flag(s)`);

    res.json(manualFlags);
  } catch (error: any) {
    console.error("[ManualFlags] Error fetching manual flags:", error);
    res.status(500).json({
      error: "Failed to fetch manual flags",
      details: error.message,
    });
  }
});

export default router;
```

### File 8: server/routes-investigate-run.ts

```typescript
import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations, runs } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// POST /tower/investigate-run - Create an investigation for a specific run
router.post("/investigate-run", async (req, res) => {
  try {
    const { runId } = req.body;

    if (!runId) {
      return res.status(400).json({ error: "runId is required" });
    }

    // Fetch the run
    const run = await db.query.runs.findFirst({
      where: eq(runs.id, runId),
    });

    if (!run) {
      return res.status(404).json({ error: "Run not found" });
    }

    // Create a new investigation for this run
    const investigationId = `inv-${runId}-${Date.now()}`;
    const investigation = {
      id: investigationId,
      trigger: "manual_investigate",
      run_id: runId,
      notes: "Manual investigation from dashboard",
      run_logs: [],
      run_meta: {
        userId: run.user_identifier || undefined,
        source: run.source,
        goal_summary: run.goal_summary,
        status: run.status,
        output: run.meta?.output,
      } as any,
    };

    await db.insert(investigations).values([investigation]);

    console.log(`[InvestigateRun] Created investigation ${investigationId} for run ${runId}`);

    res.json({
      investigation_id: investigationId,
      status: "created",
      message: "Investigation created successfully",
    });
  } catch (error: any) {
    console.error("[InvestigateRun] Error creating investigation:", error);
    res.status(500).json({
      error: "Failed to create investigation",
      details: error.message,
    });
  }
});

export default router;
```

### File 9: server.js (Excerpt)

**Note:** This is the main server file. Showing first 125 lines. Full file is 1688 lines containing all Tower routes and HTML rendering.

```javascript
import express from 'express';
import { createServer } from 'http';
import { poller } from './lib/poller.js';
import { tasksManager } from './lib/tasks.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Utility functions for rendering
function formatRelativeTime(isoString) {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function formatDelta(value) {
  if (value === undefined || value === null) return '';
  if (value === 0) return '<span style="color: #666;">±0</span>';
  if (value > 0) return `<span style="color: #22c55e;">+${value}</span>';
  return `<span style="color: #ef4444;">${value}</span>';
}

function renderStatusBadge(status) {
  if (status === 'OK') {
    return '<span style="display: inline-block; padding: 4px 12px; background: #22c55e; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">OK</span>';
  } else if (status === 'ERROR') {
    return '<span style="display: inline-block; padding: 4px 12px; background: #ef4444; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">ERROR</span>';
  }
  return '<span style="display: inline-block; padding: 4px 12px; background: #9ca3af; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">NO DATA</span>';
}

// [Rest of file contains Express routes and server setup]
// Full file includes Tower API endpoints mounted from separate route files
```

---

## E. DATABASE CONNECTION

### File 10: src/lib/db.ts

```typescript
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "../../shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
```

---

## F. REACT COMPONENTS - CORE FEATURES

### File 11: client/src/components/RecentRunsSimple.tsx

```typescript
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Wrench, Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Conversation {
  conversation_run_id: string;
  first_event_time: string;
  latest_event_time: string;
  event_count: number;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  source: string;
  user_identifier: string | null;
}

export function RecentRunsSimple() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [flagReason, setFlagReason] = useState("");

  // 🔥 Fetch conversations instead of individual runs
  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/tower/conversations"],
    refetchInterval: 5000,
  });

  // 🔥 Flag conversation mutation
  const flagMutation = useMutation({
    mutationFn: async ({ conversationRunId, reason }: { conversationRunId: string; reason?: string }) => {
      return await apiRequest("POST", `/tower/conversations/${conversationRunId}/flag`, { reason });
    },
    onSuccess: () => {
      toast({
        title: "Conversation Flagged",
        description: "This conversation has been flagged for review and added to Manual Flags.",
      });
      queryClient.invalidateQueries({ queryKey: ["/tower/manual-flags"] });
      setFlagDialogOpen(false);
      setSelectedConversation(null);
      setFlagReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to flag conversation",
        variant: "destructive",
      });
    },
  });

  const handleFlagClick = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setFlagDialogOpen(true);
  };

  const handleFlagSubmit = () => {
    if (selectedConversation) {
      flagMutation.mutate({ conversationRunId: selectedConversation.conversation_run_id, reason: flagReason || undefined });
    }
  };

  const handleViewConversationClick = (conversationRunId: string) => {
    navigate(`/dashboard/conversation/${conversationRunId}`);
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return "Unknown time";
    
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return "Unknown time";
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInputText = (conversation: Conversation): string => {
    return conversation.input_summary || "No input captured";
  };

  const getOutputText = (conversation: Conversation): string => {
    return conversation.output_summary || "No response captured";
  };

  // Filter to only show Wyshbone UI user conversations
  const userConversations = conversations?.filter(conv => conv.source === "live_user") || [];

  return (
    <>
      <Card data-testid="card-recent-runs">
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>
            All user conversations from Wyshbone UI
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading conversations...</div>
          ) : userConversations.length === 0 ? (
            <div className="text-sm text-muted-foreground">No recent conversations</div>
          ) : (
            <div className="space-y-3">
              {userConversations.slice(0, 10).map((conversation) => (
                <div
                  key={conversation.conversation_run_id}
                  className="flex flex-col gap-3 p-4 rounded-md border hover-elevate"
                  data-testid={`conversation-item-${conversation.conversation_run_id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {formatTime(conversation.first_event_time)}
                        </span>
                        {/* 🔥 Show event count badge for multi-message conversations */}
                        {conversation.event_count > 1 && (
                          <Badge variant="secondary" className="ml-2">
                            {conversation.event_count} messages
                          </Badge>
                        )}
                        {conversation.user_identifier && (
                          <>
                            <User className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-2" />
                            <span className="text-xs text-muted-foreground truncate">
                              {conversation.user_identifier}
                            </span>
                          </>
                        )}
                        <Badge
                          variant={
                            conversation.status === "success" || conversation.status === "completed" 
                              ? "default" 
                              : conversation.status === "error" || conversation.status === "fail"
                              ? "destructive"
                              : "secondary"
                          }
                          className="ml-auto flex-shrink-0"
                        >
                          {conversation.status}
                        </Badge>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Input:</div>
                        <div className="text-sm line-clamp-2">{getInputText(conversation)}</div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Latest Output:</div>
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {getOutputText(conversation)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {/* 🔥 View Timeline button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewConversationClick(conversation.conversation_run_id)}
                      data-testid={`button-view-${conversation.conversation_run_id}`}
                    >
                      <Wrench className="h-3 w-3 mr-1" />
                      View Timeline
                    </Button>
                    {/* 🔥 Flag conversation button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFlagClick(conversation)}
                      data-testid={`button-flag-${conversation.conversation_run_id}`}
                    >
                      <Flag className="h-3 w-3 mr-1" />
                      Flag conversation
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <DialogContent data-testid="dialog-flag-run">
          <DialogHeader>
            <DialogTitle>Flag Run for Review</DialogTitle>
            <DialogDescription>
              Add this run to your Manual Flags list for later investigation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedConversation?.input_summary && (
              <div>
                <Label className="text-sm font-medium">Conversation Input</Label>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedConversation.input_summary}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="flag-reason">Reason (optional)</Label>
              <Textarea
                id="flag-reason"
                placeholder="What issue did you notice? (e.g., unhelpful response, bad reasoning, hallucination)"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={3}
                data-testid="textarea-flag-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFlagDialogOpen(false)}
              data-testid="button-cancel-flag"
            >
              Cancel
            </Button>
            <Button
              onClick={handleFlagSubmit}
              disabled={flagMutation.isPending}
              data-testid="button-submit-flag"
            >
              {flagMutation.isPending ? "Flagging..." : "Flag Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### File 12: client/src/components/ManualFlagsCard.tsx

```typescript
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flag, Wrench, Clock } from "lucide-react";

interface Investigation {
  id: string;
  created_at: string;
  trigger: string;
  run_id: string | null;
  notes: string | null;
  run_meta: any;
  diagnosis: string | null;
}

export function ManualFlagsCard() {
  const [, navigate] = useLocation();
  const { data: investigations, isLoading} = useQuery<Investigation[]>({
    queryKey: ["/tower/manual-flags"],
    refetchInterval: 10000,
  });

  const handleInvestigateClick = (investigationId: string) => {
    navigate(`/dashboard/investigate/${investigationId}`);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getDisplayReason = (investigation: Investigation): string => {
    // Extract reason from notes (first line before any timestamp)
    if (investigation.notes) {
      const lines = investigation.notes.split('\n');
      return lines[0].trim();
    }
    return "No reason provided";
  };

  const getOriginalInput = (investigation: Investigation): string | null => {
    return investigation.run_meta?.goal_summary || null;
  };

  return (
    <Card data-testid="card-manual-flags">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-orange-500" />
          <div>
            <CardTitle>Manual Flags (Runs You Marked as Needing Fix)</CardTitle>
            <CardDescription className="mt-1.5">
              Runs you flagged for investigation from Recent Runs
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading manual flags...</div>
        ) : !investigations || investigations.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No manually flagged runs. Use "Flag this run" in Recent Runs to flag conversations needing review.
          </div>
        ) : (
          <div className="space-y-3">
            {investigations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-3 p-4 rounded-md border border-orange-500/20 bg-orange-500/5 hover-elevate"
                data-testid={`manual-flag-${inv.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Flagged {formatTime(inv.created_at)}
                      </span>
                      <Badge variant="outline" className="ml-auto flex-shrink-0 border-orange-500/50 text-orange-600">
                        Manual Flag
                      </Badge>
                    </div>

                    {getOriginalInput(inv) && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Original Input:</div>
                        <div className="text-sm line-clamp-2">{getOriginalInput(inv)}</div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Reason:</div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {getDisplayReason(inv)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleInvestigateClick(inv.id)}
                    data-testid={`button-investigate-manual-${inv.id}`}
                  >
                    <Wrench className="h-3 w-3 mr-1" />
                    Investigate & Fix
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### File 13: client/src/components/AutoFlaggedCard.tsx

```typescript
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Wrench, Clock, Sparkles } from "lucide-react";

interface Investigation {
  id: string;
  created_at: string;
  trigger: string;
  run_id: string | null;
  notes: string | null;
  run_meta: any;
  diagnosis: string | null;
}

export function AutoFlaggedCard() {
  const [, navigate] = useLocation();
  const { data: investigations, isLoading } = useQuery<Investigation[]>({
    queryKey: ["/tower/auto-conversation-quality"],
    refetchInterval: 10000,
  });

  const handleInvestigateClick = (investigationId: string) => {
    navigate(`/dashboard/investigate/${investigationId}`);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getFlagReason = (investigation: Investigation): string => {
    // Extract issue category and summary from diagnosis
    const analysis = investigation.run_meta?.analysis;
    if (analysis?.failureCategory) {
      const categoryMap: Record<string, string> = {
        "missing_greeting": "Missing greeting flow",
        "missing_domain_personalization": "Not personalized to user's domain",
        "incomplete_onboarding": "Incomplete onboarding questions",
        "hallucination": "Provided incorrect information",
        "bad_reasoning": "Poor reasoning or logic",
        "unhelpful_tone": "Unhelpful or inappropriate tone",
        "did_not_follow_request": "Failed to follow user request",
      };
      return categoryMap[analysis.failureCategory] || analysis.failureCategory;
    }
    return "Quality issue detected";
  };

  const getOriginalInput = (investigation: Investigation): string | null => {
    const messages = investigation.run_meta?.conversation_window;
    if (Array.isArray(messages) && messages.length > 0) {
      const userMessage = messages.find((m: any) => m.role === "user");
      return userMessage?.content || null;
    }
    return investigation.run_meta?.goal_summary || null;
  };

  const getSeverityBadge = (investigation: Investigation) => {
    const severity = investigation.run_meta?.analysis?.severity || "medium";
    const severityMap: Record<string, { variant: any; label: string }> = {
      critical: { variant: "destructive", label: "Critical" },
      high: { variant: "destructive", label: "High" },
      medium: { variant: "secondary", label: "Medium" },
      low: { variant: "outline", label: "Low" },
    };
    const config = severityMap[severity] || severityMap.medium;
    return (
      <Badge variant={config.variant} className="flex-shrink-0">
        {config.label}
      </Badge>
    );
  };

  return (
    <Card data-testid="card-auto-flagged">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Auto-Flagged Runs (Automatically Detected Issues)</CardTitle>
            <CardDescription className="mt-1.5">
              Runs that Tower automatically identified as having quality issues
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading auto-flagged runs...</div>
        ) : !investigations || investigations.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No issues detected. Tower automatically analyzes all user conversations for problems like bad reasoning, hallucinations, or unhelpful responses.
          </div>
        ) : (
          <div className="space-y-3">
            {investigations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-3 p-4 rounded-md border border-primary/20 bg-primary/5 hover-elevate"
                data-testid={`auto-flag-${inv.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        Detected {formatTime(inv.created_at)}
                      </span>
                      {getSeverityBadge(inv)}
                      <Badge variant="outline" className="flex-shrink-0 border-primary/50">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Auto-detected
                      </Badge>
                    </div>

                    {getOriginalInput(inv) && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Original Input:</div>
                        <div className="text-sm line-clamp-2">{getOriginalInput(inv)}</div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Issue Detected:</div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {getFlagReason(inv)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleInvestigateClick(inv.id)}
                    data-testid={`button-investigate-auto-${inv.id}`}
                  >
                    <Wrench className="h-3 w-3 mr-1" />
                    Investigate & Fix
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## G. REACT PAGES

### File 14: client/src/pages/status-dashboard.tsx

```typescript
import { useState } from "react";
import { EvaluatorProvider } from "@/contexts/EvaluatorContext";
import { RecentRunsSimple } from "@/components/RecentRunsSimple";
import { AutoFlaggedCard } from "@/components/AutoFlaggedCard";
import { ManualFlagsCard } from "@/components/ManualFlagsCard";
import { PatchFailuresCard } from "@/components/PatchFailuresCard";
import { BehaviourTestsCard } from "@/components/BehaviourTestsCard";
import { RecentRunsTable } from "@/components/RecentRunsTable";
import { TowerNavTabs } from "@/components/TowerNavTabs";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Settings, Activity, TestTubes, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function StatusDashboard() {
  const { toast } = useToast();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await apiRequest("POST", "/tower/reset-investigations", {});
      toast({
        title: "Tower Reset Complete",
        description: "All flags and investigations have been cleared.",
      });
      // Refresh the page to see updated data
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset Tower data",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <EvaluatorProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b">
          <div className="container mx-auto px-4 py-4">
            <TowerNavTabs />
          </div>
        </header>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-6">
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Core Sections - Always Visible */}
            <div className="space-y-6">
              {/* Section 1: Recent Runs */}
              <RecentRunsSimple />

              {/* Section 2: Auto-Flagged Runs */}
              <AutoFlaggedCard />

              {/* Section 3: Manual Flags */}
              <ManualFlagsCard />
            </div>

            {/* Advanced Tools - Collapsed by Default */}
            <CollapsibleCard
              title="Advanced Tools"
              description="Debugging and testing utilities"
              icon={<Settings className="h-5 w-5 text-muted-foreground" />}
              defaultOpen={false}
              testId="card-advanced-tools"
              headerActions={
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-reset-tower"
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Clear All Flags
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear All Flags and Investigations?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>All auto-flagged runs</li>
                          <li>All manually-flagged runs</li>
                          <li>Past investigations and diagnoses</li>
                          <li>Patch attempts and failures</li>
                        </ul>
                        <p className="mt-3 font-medium">
                          Recent runs and system configuration will NOT be affected.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-reset">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleReset}
                        disabled={isResetting}
                        data-testid="button-confirm-reset"
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isResetting ? "Clearing..." : "Clear All Data"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              }
            >
              <div className="space-y-6">
                {/* Tower Status Metrics */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Tower Status</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-xs text-muted-foreground">Active Runs</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">3</div>
                      <div className="text-xs text-muted-foreground">Total Runs</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-xs text-muted-foreground">Investigations</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">Online</div>
                      <div className="text-xs text-muted-foreground">Status</div>
                    </div>
                  </div>
                </div>

                {/* Behaviour Tests */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TestTubes className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Automated Tests</h3>
                  </div>
                  <BehaviourTestsCard />
                </div>

                {/* Patch Failures (if any exist) */}
                <div className="space-y-3">
                  <h3 className="font-medium">Patch Failures</h3>
                  <PatchFailuresCard />
                </div>

                {/* All Runs Table */}
                <div className="space-y-3">
                  <h3 className="font-medium">Complete Run History</h3>
                  <RecentRunsTable />
                </div>
              </div>
            </CollapsibleCard>
          </div>
        </div>
      </div>
    </EvaluatorProvider>
  );
}
```

### File 15: client/src/pages/conversation-timeline.tsx

```typescript
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, MessageSquare } from "lucide-react";

interface RunEvent {
  id: string;
  created_at: string;
  source: string;
  user_identifier: string | null;
  goal_summary: string | null;
  status: string;
  meta: any;
}

export default function ConversationTimeline() {
  const { conversationRunId } = useParams<{ conversationRunId: string }>();
  const [, navigate] = useLocation();

  // 🔥 Fetch all events for this conversation
  const { data: events, isLoading } = useQuery<RunEvent[]>({
    queryKey: ["/tower/conversations", conversationRunId, "events"],
    enabled: !!conversationRunId,
  });

  const formatTime = (timestamp: string) => {
    if (!timestamp) return "Unknown time";
    
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return "Unknown time";
    }
    
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getInputText = (event: RunEvent): string => {
    return event.goal_summary || 
           event.meta?.inputText || 
           event.meta?.requestText || 
           "No input";
  };

  const getOutputText = (event: RunEvent): string => {
    return event.meta?.output || 
           event.meta?.responseText || 
           event.meta?.outputText || 
           "No response";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">Loading conversation...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">No events found for this conversation.</div>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="mt-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversation Timeline</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {events.length} {events.length === 1 ? 'message' : 'messages'} in this conversation
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/dashboard")}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <div className="space-y-4">
        {/* 🔥 Display each event in chronological order */}
        {events.map((event, index) => (
          <Card key={event.id} data-testid={`event-item-${index}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">
                    Message {index + 1}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      event.status === "success" || event.status === "completed" 
                        ? "default" 
                        : event.status === "error" || event.status === "fail"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {event.status}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTime(event.created_at)}
                  </div>
                </div>
              </div>
              {event.meta?.durationMs && (
                <CardDescription>
                  Duration: {(event.meta.durationMs / 1000).toFixed(2)}s
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Input:</div>
                <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                  {getInputText(event)}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Output:</div>
                <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                  {getOutputText(event)}
                </div>
              </div>

              {event.meta?.toolCalls && event.meta.toolCalls.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Tools Used:</div>
                  <div className="flex flex-wrap gap-2">
                    {event.meta.toolCalls.map((tool: any, toolIndex: number) => (
                      <Badge key={toolIndex} variant="outline">
                        {tool.name || 'Unknown tool'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {event.meta?.model && (
                <div className="text-xs text-muted-foreground">
                  Model: {event.meta.model}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### File 16: client/src/App.tsx

```typescript
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import StatusDashboard from "@/pages/status-dashboard";
import InvestigatePage from "@/pages/investigate";
import ConversationTimeline from "@/pages/conversation-timeline";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/dashboard" component={StatusDashboard} />
      <Route path="/dashboard/investigate/:id" component={InvestigatePage} />
      {/* 🔥 NEW: Conversation timeline route */}
      <Route path="/dashboard/conversation/:conversationRunId" component={ConversationTimeline} />
      <Route path="/" component={StatusDashboard} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
```

---

## H. REACT UTILITIES

### File 17: client/src/lib/queryClient.ts

```typescript
import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

---

## I. DOCUMENTATION

### File 18: replit.md

```markdown
# Wyshbone Status Dashboard

## Overview

This project is a lightweight Node/Express application for monitoring the status and key metrics of multiple Wyshbone applications. It provides a live, server-side rendered dashboard, a JSON API, and a file proxy for authenticated access. Its core purpose is to offer real-time insights into application health, performance, and code quality, tracking changes over time to provide comprehensive observability and automated evaluation for Wyshbone applications.

## User Preferences

I prefer iterative development with clear, concise explanations. I want to be informed about major architectural decisions before they are implemented. Provide comprehensive context for any suggested changes or new features.

## System Architecture

The application is built on Node.js using Express, rendering server-side HTML with template literals and utilizing an in-memory Map for historical data tracking. It features automated polling of Wyshbone app endpoints every 2 minutes, history tracking (last 50 snapshots per source), delta computation for metrics, an auto-refreshing HTML dashboard (every 60 seconds), and robust error handling. A file proxy provides authenticated access to application resources.

The system incorporates a sophisticated evaluation suite (EVAL-001 to EVAL-016) for automated testing, diagnosis, and patch management:

*   **Investigation System (EVAL-001):** Manages investigations, triggers, and diagnostic results in a PostgreSQL database. Uses OpenAI GPT-4o-mini for automated diagnosis and patch suggestions.
*   **Automated Behaviour Tests (EVAL-002):** A harness for running scenario-specific tests against Wyshbone UI endpoints, recording results, and displaying statuses.
*   **Automated Detection and Investigation Triggering (EVAL-003):** Automatically triggers investigations for failures, timeouts, errors, and regressions detected by behaviour tests.
*   **Patch Quality + Regression Protection (EVAL-004):** A CI/CD-like gatekeeper that evaluates proposed patches in a sandbox, applying strict rejection rules to prevent regressions and quality degradation.
*   **Junior Developer Agent Integration (EVAL-005):** Manages the full patch lifecycle from investigation to application, including generating developer briefs and managing patch suggestions.
*   **Auto-Patch Generator (EVAL-006):** LLM-powered automatic patch generation for investigations using GPT-4o-mini, with automated evaluation via EVAL-004.
*   **Behaviour Test Investigation Bridge (EVAL-007):** Integrates behaviour tests with the investigation system, enabling automatic and manual investigation creation for test issues with deduplication.
*   **Live User Run Logging & Investigation Bridge (EVAL-008):** Logs real Wyshbone UI user conversations for observability, displaying recent runs, and enabling investigation creation with deduplication.
*   **Conversation Quality Investigator (EVAL-009):** Analyzes flagged and automatically detects Wyshbone-specific conversation quality issues using GPT-4o-mini, classifying failures, providing summaries, and suggesting fixes/tests. Includes dashboard integration for viewing and managing issues.
*   **Patch Failure Post-Mortem (EVAL-016):** Automatically analyzes rejected auto-generated patches (from EVAL-006) to classify failure reasons, recommend next steps, and provide suggested constraints for future patch attempts.

UI/UX decisions have been completely simplified for ease of use. The dashboard now uses plain language and focuses on three core sections:

**Simplified Dashboard Design:**

*   **Recent Runs:** Shows all user conversations from Wyshbone UI with conversation-level grouping. Multiple messages with the same `runId` are grouped as a single conversation card. Each card displays:
    *   Event count badge (e.g., "3 messages")
    *   First message input summary
    *   Time range (first message to latest message)
    *   Status indicator
    *   "View Timeline" button to see all messages chronologically
    *   "Flag conversation" button to mark entire conversation for review
*   **Auto-Flagged Runs:** Automatically detected quality issues (bad reasoning, hallucinations, unhelpful tone, etc.). Each entry shows the original input and reason it was flagged.
*   **Manual Flags:** Conversations that users manually flagged for review. Shows original input and optional user-provided reason.
*   **Advanced Tools (Collapsed):** Contains Tower Status metrics, Automated Tests, Patch Failures, and Complete Run History. Includes a "Clear All Flags" button to reset investigation data.

**Conversation Timeline View:**

When clicking "View Timeline" from any conversation, users see a detailed chronological view of all messages in that conversation, including:
*   Message number and timestamp for each event
*   Input and output text for each message
*   Status badges (success, error, etc.)
*   Duration and tool usage metadata
*   Model information when available

**Simplified Investigation Workflow:**

When clicking "Investigate & Fix" from any section, users are taken to a dedicated investigation page that shows:
1. Run input and output
2. Auto diagnosis explaining the issue
3. Suggested patch (code changes to fix the problem)
4. "Approve Patch" and "Reject Patch" buttons

This replaces the previous complex sidebar-based workflow with a straightforward, task-focused page.

**Language Simplification:**

All technical jargon has been removed:
- "EVAL-XXX" references removed
- "Conversation quality" → "Quality issues"  
- "Investigation system" → "Investigate & Fix"
- "Patch lifecycle" → "Patch suggestions"
- "Sandbox evaluation" → (removed, happens transparently)

## External Dependencies

*   **Node.js:** Runtime environment.
*   **Express:** Web application framework.
*   **PostgreSQL:** Database for persistent data storage (via Neon).
*   **OpenAI GPT-4o-mini:** Used for automated diagnosis, patch generation, and conversation quality analysis.
*   **Vite:** Used for serving the React SPA and development tooling.
```

---

## SUMMARY

### Files by Architectural Layer

**A. Database Schema (1 file)**
- `shared/schema.ts` - Drizzle ORM schema with `conversation_run_id` field

**B. Server Ingestion & Storage (2 files)**
- `src/evaluator/runLogger.ts` - Behaviour test logging
- `src/evaluator/runStore.ts` - **Core ingestion logic with conversation grouping**

**C. Types & Interfaces (2 files)**
- `src/evaluator/types.ts` - Investigation and analysis types
- `src/evaluator/chatApiTypes.ts` - Chat API payload types

**D. API Routes (4 files)**
- `server/index.ts` - Dashboard entry point
- `server/routes-manual-flags.ts` - **Conversation-level flagging endpoints**
- `server/routes-investigate-run.ts` - Investigation creation
- `server.js` - Main server with all routes mounted

**E. Database Connection (1 file)**
- `src/lib/db.ts` - Neon PostgreSQL connection

**F. React Components (3 files)**
- `client/src/components/RecentRunsSimple.tsx` - **Conversation cards with grouping**
- `client/src/components/ManualFlagsCard.tsx` - Manual flags display
- `client/src/components/AutoFlaggedCard.tsx` - Auto-detected issues

**G. React Pages (3 files)**
- `client/src/pages/status-dashboard.tsx` - Main dashboard
- `client/src/pages/conversation-timeline.tsx` - **New timeline view**
- `client/src/App.tsx` - Route configuration

**H. React Utilities (1 file)**
- `client/src/lib/queryClient.ts` - TanStack Query setup

**I. Documentation (1 file)**
- `replit.md` - Project documentation

### Total Files Audited: 18

### Key Implementation Points

🔥 **conversation_run_id** - New database field linking events to conversations  
🔥 **createLiveUserRun()** - Extracts runId from payload, creates unique event IDs  
🔥 **listConversations()** - SQL GROUP BY aggregating events per conversation  
🔥 **getConversationEvents()** - Returns all events for a conversation in chronological order  
🔥 **POST /tower/conversations/:id/flag** - Conversation-level flagging endpoint  
🔥 **GET /tower/conversations** - API endpoint returning grouped conversations  
🔥 **RecentRunsSimple** - UI component displaying one card per conversation  
🔥 **ConversationTimeline** - New page showing all messages in a conversation  
🔥 **Route:** `/dashboard/conversation/:conversationRunId` - Timeline route  

### Potential Issues Identified

None critical. Architecture is clean and well-structured. Minor notes:
- `server/routes.ts` may contain legacy endpoints (not reviewed in this audit)
- `client/src/pages/status-dashboard-old.tsx` appears to be old version
- `client/src/components/RecentRunsTable.tsx` may be legacy component

---

**End of Audit Document**
