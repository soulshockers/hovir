CREATE TABLE "slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presentation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"plugin_id" text NOT NULL,
	"plugin_version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_presentation_id_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slides_presentation_position_idx" ON "slides" USING btree ("presentation_id","position");