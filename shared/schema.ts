import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, uuid, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  id: text("id").primaryKey(),
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
    verticalId?: string;
  }>(),
  ui_snapshot: jsonb("ui_snapshot"),
  supervisor_snapshot: jsonb("supervisor_snapshot"),
  diagnosis: text("diagnosis"),
  patch_suggestion: text("patch_suggestion"),
  replit_patch_prompt: text("replit_patch_prompt"),
  approved_at: timestamp("approved_at"),
  vertical_id: text("vertical_id"),
});

export const insertInvestigationSchema = createInsertSchema(investigations);
export type InsertInvestigation = z.infer<typeof insertInvestigationSchema>;
export type Investigation = typeof investigations.$inferSelect;

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  conversation_run_id: text("conversation_run_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  source: text("source").notNull(),
  user_identifier: text("user_identifier"),
  goal_summary: text("goal_summary"),
  status: text("status").notNull().default("completed"),
  vertical_id: text("vertical_id"),
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
  id: uuid("id").primaryKey().defaultRandom(),
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
  id: uuid("id").primaryKey().defaultRandom(),
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
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: text("investigation_id").notNull(),
  runId: text("run_id"),
  source: text("source").notNull().default("agent"),
  patchText: text("patch_text").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("suggested"),
  patchEvaluationId: text("patch_evaluation_id"),
  externalLink: text("external_link"),
  meta: jsonb("meta").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPatchSuggestionSchema = createInsertSchema(patchSuggestions);
export type InsertPatchSuggestion = z.infer<typeof insertPatchSuggestionSchema>;
export type PatchSuggestion = typeof patchSuggestions.$inferSelect;

export const devIssues = pgTable("dev_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  status: text("status").notNull().default("new"),
});

export const insertDevIssueSchema = createInsertSchema(devIssues).omit({
  id: true,
  createdAt: true,
});
export type InsertDevIssue = z.infer<typeof insertDevIssueSchema>;
export type DevIssue = typeof devIssues.$inferSelect;

export const devIssueContext = pgTable("dev_issue_context", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: text("issue_id").notNull(),
  filePath: text("file_path"),
  fileContents: text("file_contents"),
  logExcerpt: text("log_excerpt"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDevIssueContextSchema = createInsertSchema(devIssueContext).omit({
  id: true,
  createdAt: true,
});
export type InsertDevIssueContext = z.infer<typeof insertDevIssueContextSchema>;
export type DevIssueContext = typeof devIssueContext.$inferSelect;

export const devIssuePatches = pgTable("dev_issue_patches", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: text("issue_id").notNull(),
  filePath: text("file_path").notNull(),
  newContents: text("new_contents").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDevIssuePatchSchema = createInsertSchema(devIssuePatches).omit({
  id: true,
  createdAt: true,
});
export type InsertDevIssuePatch = z.infer<typeof insertDevIssuePatchSchema>;
export type DevIssuePatch = typeof devIssuePatches.$inferSelect;

export const strategies = pgTable("strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  config: jsonb("config").$type<Record<string, any>>().notNull(),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStrategySchema = createInsertSchema(strategies);
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type StrategyRow = typeof strategies.$inferSelect;
export type Strategy = Omit<StrategyRow, 'isActive'> & {
  isActive: boolean;
};

export const strategyPerformance = pgTable("strategy_performance", {
  id: uuid("id").primaryKey().defaultRandom(),
  strategyId: text("strategy_id").notNull(),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  context: text("context").notNull(),
  runId: text("run_id"),
  metrics: jsonb("metrics").$type<{
    successRate?: number;
    avgDuration?: number;
    errorCount?: number;
    userSatisfaction?: number;
    throughput?: number;
    [key: string]: any;
  }>().notNull(),
  outcome: text("outcome").notNull(),
  meta: jsonb("meta").$type<Record<string, any>>(),
});

export const insertStrategyPerformanceSchema = createInsertSchema(strategyPerformance);
export type InsertStrategyPerformance = z.infer<typeof insertStrategyPerformanceSchema>;
export type StrategyPerformance = typeof strategyPerformance.$inferSelect;

export const abTests = pgTable("ab_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  strategyAId: text("strategy_a_id").notNull(),
  strategyBId: text("strategy_b_id").notNull(),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  config: jsonb("config").$type<{
    trafficSplit?: number;
    minSampleSize?: number;
    maxDurationDays?: number;
    [key: string]: any;
  }>(),
  results: jsonb("results").$type<{
    strategyAMetrics?: any;
    strategyBMetrics?: any;
    winner?: string;
    significance?: number;
    recommendation?: string;
    [key: string]: any;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAbTestSchema = createInsertSchema(abTests);
export type InsertAbTest = z.infer<typeof insertAbTestSchema>;
export type AbTest = typeof abTests.$inferSelect;

export const abTestResults = pgTable("ab_test_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  testId: text("test_id").notNull(),
  strategyId: text("strategy_id").notNull(),
  variant: text("variant").notNull(),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  metrics: jsonb("metrics").$type<{
    successRate?: number;
    avgDuration?: number;
    errorCount?: number;
    userSatisfaction?: number;
    [key: string]: any;
  }>().notNull(),
  outcome: text("outcome").notNull(),
});

export const insertAbTestResultSchema = createInsertSchema(abTestResults);
export type InsertAbTestResult = z.infer<typeof insertAbTestResultSchema>;
export type AbTestResult = typeof abTestResults.$inferSelect;

export const failureCategories = pgTable("failure_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull(),
  patterns: jsonb("patterns").$type<string[]>().notNull(),
  recommendationTemplate: text("recommendation_template").notNull(),
  severity: text("severity").notNull().default("medium"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFailureCategorySchema = createInsertSchema(failureCategories);
export type InsertFailureCategory = z.infer<typeof insertFailureCategorySchema>;
export type FailureCategory = typeof failureCategories.$inferSelect;

export const categorizedFailures = pgTable("categorized_failures", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: text("category_id").notNull(),
  runId: text("run_id"),
  investigationId: text("investigation_id"),
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  context: jsonb("context").$type<Record<string, any>>(),
  confidence: text("confidence").notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  meta: jsonb("meta").$type<Record<string, any>>(),
});

export const insertCategorizedFailureSchema = createInsertSchema(categorizedFailures);
export type InsertCategorizedFailure = z.infer<typeof insertCategorizedFailureSchema>;
export type CategorizedFailure = typeof categorizedFailures.$inferSelect;

export const failurePatterns = pgTable("failure_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  categoryId: text("category_id").notNull(),
  occurrences: text("occurrences").notNull().default("1"),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  frequency: text("frequency").notNull().default("low"),
  relatedFailures: jsonb("related_failures").$type<string[]>(),
  recommendation: text("recommendation"),
  status: text("status").notNull().default("active"),
});

export const insertFailurePatternSchema = createInsertSchema(failurePatterns);
export type InsertFailurePattern = z.infer<typeof insertFailurePatternSchema>;
export type FailurePatternRow = typeof failurePatterns.$inferSelect;
export type FailurePattern = Omit<FailurePatternRow, 'occurrences'> & {
  occurrences: number;
};

export const failureMemory = pgTable("failure_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: text("category_id").notNull(),
  patternId: text("pattern_id"),
  solution: text("solution").notNull(),
  successRate: text("success_rate").notNull(),
  timesApplied: text("times_applied").notNull().default("0"),
  lastAppliedAt: timestamp("last_applied_at"),
  metadata: jsonb("metadata").$type<{
    avgResolutionTime?: number;
    applicableContexts?: string[];
    prerequisites?: string[];
    [key: string]: any;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFailureMemorySchema = createInsertSchema(failureMemory);
export type InsertFailureMemory = z.infer<typeof insertFailureMemorySchema>;
export type FailureMemoryRow = typeof failureMemory.$inferSelect;
export type FailureMemory = Omit<FailureMemoryRow, 'successRate' | 'timesApplied'> & {
  successRate: number;
  timesApplied: number;
};

export const judgementEvaluations = pgTable("judgement_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  run_id: text("run_id").notNull(),
  mission_type: text("mission_type").notNull(),
  verdict: text("verdict").notNull(),
  reason_code: text("reason_code").notNull(),
  explanation: text("explanation").notNull(),
  success_criteria: jsonb("success_criteria").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  strategy: jsonb("strategy"),
  evaluated_at: timestamp("evaluated_at").notNull().defaultNow(),
});

export const insertJudgementEvaluationSchema = createInsertSchema(judgementEvaluations).omit({
  id: true,
});
export type InsertJudgementEvaluation = z.infer<typeof insertJudgementEvaluationSchema>;
export type JudgementEvaluation = typeof judgementEvaluations.$inferSelect;

export const judgementVerdictEnum = z.enum(["CONTINUE", "STOP", "CHANGE_STRATEGY"]);
export type JudgementVerdict = z.infer<typeof judgementVerdictEnum>;

export const judgementReasonCodeEnum = z.enum([
  "SUCCESS_ACHIEVED",
  "COST_EXCEEDED",
  "CPL_EXCEEDED",
  "FAILURES_EXCEEDED",
  "STALL_DETECTED",
  "RUNNING",
]);
export type JudgementReasonCode = z.infer<typeof judgementReasonCodeEnum>;

export const judgementSuccessSchema = z.object({
  target_leads: z.number().int().min(0),
  max_cost_gbp: z.number().min(0),
  max_cost_per_lead_gbp: z.number().min(0),
  min_quality_score: z.number().min(0).max(1),
  max_steps: z.number().int().min(1),
  max_failures: z.number().int().min(0).default(10),
  stall_window_steps: z.number().int().min(1),
  stall_min_delta_leads: z.number().int().min(0),
});
export type JudgementSuccess = z.infer<typeof judgementSuccessSchema>;

export const judgementSnapshotSchema = z.object({
  steps_completed: z.number().int().min(0),
  leads_found: z.number().int().min(0),
  leads_new_last_window: z.number().int().min(0),
  failures_count: z.number().int().min(0),
  total_cost_gbp: z.number().min(0),
  avg_quality_score: z.number().min(0).max(1),
  last_error_code: z.string().optional(),
});
export type JudgementSnapshot = z.infer<typeof judgementSnapshotSchema>;

export const judgementRequestSchema = z.object({
  run_id: z.string().min(1),
  mission_type: z.string().min(1),
  success: judgementSuccessSchema,
  snapshot: judgementSnapshotSchema,
});
export type JudgementRequest = z.infer<typeof judgementRequestSchema>;

export const judgementResponseSchema = z.object({
  verdict: judgementVerdictEnum,
  reason_code: judgementReasonCodeEnum,
  explanation: z.string(),
  strategy: z.object({
    suggested_action: z.string(),
    parameters: z.record(z.any()).optional(),
  }).optional(),
  evaluated_at: z.string(),
});
export type JudgementResponse = z.infer<typeof judgementResponseSchema>;
