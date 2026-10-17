CREATE TABLE "leash"."verified_payees" (
	"kitty_id" text NOT NULL,
	"email" text NOT NULL,
	"verified_by" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verified_payees_kitty_id_email_pk" PRIMARY KEY("kitty_id","email")
);
--> statement-breakpoint
ALTER TABLE "leash"."verified_payees" ADD CONSTRAINT "verified_payees_kitty_id_kitties_id_fk" FOREIGN KEY ("kitty_id") REFERENCES "leash"."kitties"("id") ON DELETE no action ON UPDATE no action;