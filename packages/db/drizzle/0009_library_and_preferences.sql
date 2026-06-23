CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "library_entries_user_book_unique" UNIQUE("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "user_book_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"spoiler_cap_chapter" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_book_preferences_user_book_unique" UNIQUE("user_id","book_id")
);
--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_preferences" ADD CONSTRAINT "user_book_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_preferences" ADD CONSTRAINT "user_book_preferences_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_entries_user_active_idx" ON "library_entries" USING btree ("user_id","added_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "library_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "library_entries_book_id_idx" ON "library_entries" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "user_book_preferences_user_id_idx" ON "user_book_preferences" USING btree ("user_id");