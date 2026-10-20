CREATE TABLE "instance_meta" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_meta_singleton" CHECK ("instance_meta"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "instance_meta" ENABLE ROW LEVEL SECURITY;