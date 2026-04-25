CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"book_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"plain_text" text NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_book_id_ordinal_unique" UNIQUE("book_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"book_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"token_count" integer NOT NULL,
	"start_char" integer NOT NULL,
	"end_char" integer NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunks_book_id_chapter_id_ordinal_unique" UNIQUE("book_id","chapter_id","ordinal")
);
--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "ingestion_progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "ingestion_last_stage" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "ingestion_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "indexed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapters_book_id_ordinal_idx" ON "chapters" USING btree ("book_id","ordinal");--> statement-breakpoint
CREATE INDEX "chunks_book_id_pending_embedding_idx" ON "chunks" USING btree ("book_id") WHERE "chunks"."embedding" IS NULL;--> statement-breakpoint
CREATE INDEX "chunks_chapter_id_idx" ON "chunks" USING btree ("chapter_id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_ingestion_progress_check" CHECK ("books"."ingestion_progress" BETWEEN 0 AND 100);