CREATE TABLE "bounties" (
	"id" integer PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"repo_owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"issue_number" integer NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"claimed_by" text,
	"public_amount" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "claim_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"bounty_id" integer NOT NULL,
	"request_id" text NOT NULL,
	"pr_number" integer NOT NULL,
	"claimer" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"address" text PRIMARY KEY NOT NULL,
	"github_username" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_id" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"event_name" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_block" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "claim_attempts" ADD CONSTRAINT "claim_attempts_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bounties_status" ON "bounties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bounties_creator" ON "bounties" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "idx_claims_bounty" ON "claim_attempts" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX "idx_claims_status" ON "claim_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_developers_username" ON "developers" USING btree ("github_username");--> statement-breakpoint
CREATE INDEX "idx_developers_status" ON "developers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_events_unique" ON "events" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "idx_events_block" ON "events" USING btree ("block_number");--> statement-breakpoint
CREATE INDEX "idx_events_name" ON "events" USING btree ("event_name");