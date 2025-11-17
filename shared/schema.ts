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
  conversation_run_id: text("conversation_run_id"),
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
