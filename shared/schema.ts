import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Helper to generate UUIDs in SQLite
const genId = () => crypto.randomUUID();

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(genId),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const investigations = sqliteTable("investigations", {
  id: text("id").primaryKey(),
  created_at: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  trigger: text("trigger").notNull(),
  run_id: text("run_id"),
  notes: text("notes"),
  run_logs: text("run_logs", { mode: "json" }).notNull().$type<any[]>(),
  run_meta: text("run_meta", { mode: "json" }).$type<{
    userId?: string;
    sessionId?: string;
    agent?: "ui" | "supervisor" | "tower";
    description?: string;
    verticalId?: string;
  }>(),
  ui_snapshot: text("ui_snapshot", { mode: "json" }),
  supervisor_snapshot: text("supervisor_snapshot", { mode: "json" }),
  diagnosis: text("diagnosis"),
  patch_suggestion: text("patch_suggestion"),
  replit_patch_prompt: text("replit_patch_prompt"),
  approved_at: integer("approved_at", { mode: "timestamp" }),
  /** TOW-8: Vertical/industry identifier for filtering by business vertical */
  vertical_id: text("vertical_id"),
});

export const insertInvestigationSchema = createInsertSchema(investigations);
export type InsertInvestigation = z.infer<typeof insertInvestigationSchema>;
export type Investigation = typeof investigations.$inferSelect;

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  conversation_run_id: text("conversation_run_id"),
  created_at: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  source: text("source").notNull(),
  user_identifier: text("user_identifier"),
  goal_summary: text("goal_summary"),
  status: text("status").notNull().default("completed"),
  /** TOW-8: Vertical/industry identifier for filtering by business vertical */
  vertical_id: text("vertical_id"),
  meta: text("meta", { mode: "json" }).$type<{
    duration?: number;
    toolsUsed?: string[];
    tokensUsed?: number;
    [key: string]: any;
  }>(),
});

export const insertRunSchema = createInsertSchema(runs);
export type InsertRun = z.infer<typeof insertRunSchema>;
export type Run = typeof runs.$inferSelect;

export const behaviourTests = sqliteTable("behaviour_tests", {
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

export const behaviourTestRuns = sqliteTable("behaviour_test_runs", {
  id: text("id").primaryKey().$defaultFn(genId),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  testId: text("test_id").notNull(),
  status: text("status").notNull(),
  details: text("details"),
  rawLog: text("raw_log", { mode: "json" }),
  buildTag: text("build_tag"),
  durationMs: text("duration_ms"),
});

export const insertBehaviourTestRunSchema = createInsertSchema(behaviourTestRuns);
export type InsertBehaviourTestRun = z.infer<typeof insertBehaviourTestRunSchema>;
export type BehaviourTestRunRow = typeof behaviourTestRuns.$inferSelect;
export type BehaviourTestRun = Omit<BehaviourTestRunRow, 'durationMs'> & {
  durationMs: number | null;
};

export const patchEvaluations = sqliteTable("patch_evaluations", {
  id: text("id").primaryKey().$defaultFn(genId),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  status: text("status").notNull(),
  patchText: text("patch_text").notNull(),
  diff: text("diff", { mode: "json" }),
  reasons: text("reasons", { mode: "json" }).$type<string[]>(),
  testResultsBefore: text("test_results_before", { mode: "json" }),
  testResultsAfter: text("test_results_after", { mode: "json" }),
  investigationIds: text("investigation_ids", { mode: "json" }).$type<string[]>(),
  evaluationMeta: text("evaluation_meta", { mode: "json" }).$type<{
    latencyRegressions?: Array<{ testId: string; before: number; after: number; increase: number }>;
    qualityFlags?: string[];
    autoDetectTriggers?: string[];
    [key: string]: any;
  }>(),
});

export const insertPatchEvaluationSchema = createInsertSchema(patchEvaluations);
export type InsertPatchEvaluation = z.infer<typeof insertPatchEvaluationSchema>;
export type PatchEvaluation = typeof patchEvaluations.$inferSelect;

export const patchSuggestions = sqliteTable("patch_suggestions", {
  id: text("id").primaryKey().$defaultFn(genId),
  investigationId: text("investigation_id").notNull(),
  runId: text("run_id"),
  source: text("source").notNull().default("agent"),
  patchText: text("patch_text").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("suggested"),
  patchEvaluationId: text("patch_evaluation_id"),
  externalLink: text("external_link"),
  meta: text("meta", { mode: "json" }).$type<Record<string, any>>().default({}),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertPatchSuggestionSchema = createInsertSchema(patchSuggestions);
export type InsertPatchSuggestion = z.infer<typeof insertPatchSuggestionSchema>;
export type PatchSuggestion = typeof patchSuggestions.$inferSelect;

// Dev Issues - Tower Dev Chat v0
export const devIssues = sqliteTable("dev_issues", {
  id: text("id").primaryKey().$defaultFn(genId),
  title: text("title").notNull(),
  description: text("description").notNull(),
  screenshotUrl: text("screenshot_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  status: text("status").notNull().default("new"),
});

export const insertDevIssueSchema = createInsertSchema(devIssues).omit({
  id: true,
  createdAt: true,
});
export type InsertDevIssue = z.infer<typeof insertDevIssueSchema>;
export type DevIssue = typeof devIssues.$inferSelect;

// Dev Issue Context - stores relevant files and logs for each issue
export const devIssueContext = sqliteTable("dev_issue_context", {
  id: text("id").primaryKey().$defaultFn(genId),
  issueId: text("issue_id").notNull(),
  filePath: text("file_path"),
  fileContents: text("file_contents"),
  logExcerpt: text("log_excerpt"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertDevIssueContextSchema = createInsertSchema(devIssueContext).omit({
  id: true,
  createdAt: true,
});
export type InsertDevIssueContext = z.infer<typeof insertDevIssueContextSchema>;
export type DevIssueContext = typeof devIssueContext.$inferSelect;

// Dev Issue Patches - AI-suggested code changes for each issue
export const devIssuePatches = sqliteTable("dev_issue_patches", {
  id: text("id").primaryKey().$defaultFn(genId),
  issueId: text("issue_id").notNull(),
  filePath: text("file_path").notNull(),
  newContents: text("new_contents").notNull(),
  summary: text("summary").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertDevIssuePatchSchema = createInsertSchema(devIssuePatches).omit({
  id: true,
  createdAt: true,
});
export type InsertDevIssuePatch = z.infer<typeof insertDevIssuePatchSchema>;
export type DevIssuePatch = typeof devIssuePatches.$inferSelect;
