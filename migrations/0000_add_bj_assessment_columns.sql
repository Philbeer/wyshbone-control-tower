CREATE TABLE "ab_test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"variant" text NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"metrics" jsonb NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"strategy_a_id" text NOT NULL,
	"strategy_b_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"config" jsonb,
	"results" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ab_tests_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "behaviour_judge_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"confidence" integer,
	"tower_verdict" text,
	"delivered_count" integer,
	"requested_count" integer,
	"input_snapshot" jsonb,
	"mission_intent_assessment" jsonb,
	"ground_truth_assessment" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behaviour_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"test_id" text NOT NULL,
	"status" text NOT NULL,
	"details" text,
	"raw_log" jsonb,
	"build_tag" text,
	"duration_ms" text
);
--> statement-breakpoint
CREATE TABLE "behaviour_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorized_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" text NOT NULL,
	"run_id" text,
	"investigation_id" text,
	"error_message" text NOT NULL,
	"error_stack" text,
	"context" jsonb,
	"confidence" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolution" text,
	"resolved_at" timestamp,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "dev_issue_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" text NOT NULL,
	"file_path" text,
	"file_contents" text,
	"log_excerpt" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_issue_patches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" text NOT NULL,
	"file_path" text NOT NULL,
	"new_contents" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"screenshot_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failure_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"keywords" jsonb NOT NULL,
	"patterns" jsonb NOT NULL,
	"recommendation_template" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "failure_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "failure_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" text NOT NULL,
	"pattern_id" text,
	"solution" text NOT NULL,
	"success_rate" text NOT NULL,
	"times_applied" text DEFAULT '0' NOT NULL,
	"last_applied_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failure_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category_id" text NOT NULL,
	"occurrences" text DEFAULT '1' NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"frequency" text DEFAULT 'low' NOT NULL,
	"related_failures" jsonb,
	"recommendation" text,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"trigger" text NOT NULL,
	"run_id" text,
	"notes" text,
	"run_logs" jsonb NOT NULL,
	"run_meta" jsonb,
	"ui_snapshot" jsonb,
	"supervisor_snapshot" jsonb,
	"diagnosis" text,
	"patch_suggestion" text,
	"replit_patch_prompt" text,
	"approved_at" timestamp,
	"vertical_id" text
);
--> statement-breakpoint
CREATE TABLE "learning_artefacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text,
	"scope_key" text NOT NULL,
	"policy_name" text NOT NULL,
	"artefact_type" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"evidence_summary" jsonb,
	"confidence" integer,
	"rollback_pointer" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patch_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"patch_text" text NOT NULL,
	"diff" jsonb,
	"reasons" jsonb,
	"test_results_before" jsonb,
	"test_results_after" jsonb,
	"investigation_ids" jsonb,
	"evaluation_meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "patch_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" text NOT NULL,
	"run_id" text,
	"source" text DEFAULT 'agent' NOT NULL,
	"patch_text" text NOT NULL,
	"summary" text,
	"status" text DEFAULT 'suggested' NOT NULL,
	"patch_evaluation_id" text,
	"external_link" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_key" text NOT NULL,
	"policy_name" text NOT NULL,
	"version" integer NOT NULL,
	"value" jsonb NOT NULL,
	"source" text DEFAULT 'learning_layer' NOT NULL,
	"evidence_pointer" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"user_identifier" text,
	"goal_summary" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"vertical_id" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "strategies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "strategy_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" text NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"context" text NOT NULL,
	"run_id" text,
	"metrics" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "tower_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"artefact_id" text,
	"artefact_type" text NOT NULL,
	"verdict" text NOT NULL,
	"stop_reason" jsonb,
	"delivered" integer,
	"requested" integer,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" integer,
	"rationale" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
