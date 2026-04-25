CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"gutendex_id" integer NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb NOT NULL,
	"languages" text[] NOT NULL,
	"subjects" text[] DEFAULT '{}' NOT NULL,
	"download_url_epub" text,
	"download_url_txt" text,
	"cover_url" text,
	"raw_hash" text,
	"ingestion_status" text DEFAULT 'discovered' NOT NULL,
	"ingestion_error" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "books_gutendex_id_unique" UNIQUE("gutendex_id"),
	CONSTRAINT "books_ingestion_status_check" CHECK ("books"."ingestion_status" IN ('discovered', 'downloading', 'parsing', 'chunking', 'embedding', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "books_created_at_id_active_idx" ON "books" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "books"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "books_ingestion_status_active_idx" ON "books" USING btree ("ingestion_status") WHERE "books"."deleted_at" IS NULL;