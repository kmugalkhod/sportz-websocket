ALTER TABLE "commentary" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commentary" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "start_time" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "end_time" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "cricbuzz_match_id" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "series_name" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "match_format" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_wickets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_wickets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_overs" text DEFAULT '0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_overs" text DEFAULT '0.0' NOT NULL;--> statement-breakpoint
CREATE INDEX "commentary_match_seq_idx" ON "commentary" USING btree ("match_id","sequence");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_cricbuzz_idx" ON "matches" USING btree ("cricbuzz_match_id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_cricbuzz_match_id_unique" UNIQUE("cricbuzz_match_id");