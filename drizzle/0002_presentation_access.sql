CREATE TABLE "presentations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"theme" jsonb DEFAULT '{"preset":"light"}'::jsonb NOT NULL,
	"locale" text DEFAULT 'auto' NOT NULL,
	"edit_token_hash" text NOT NULL,
	"present_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentations_edit_token_hash_unique" UNIQUE("edit_token_hash"),
	CONSTRAINT "presentations_present_token_hash_unique" UNIQUE("present_token_hash")
);
--> statement-breakpoint
ALTER TABLE "presentations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"client_key" text NOT NULL,
	"bucket" text NOT NULL,
	"hits" timestamp with time zone[] NOT NULL,
	"last_allowed" boolean NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_client_key_bucket_pk" PRIMARY KEY("client_key","bucket")
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits" USING btree ("expires_at");