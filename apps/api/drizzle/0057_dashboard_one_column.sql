-- #495: one column on every screen, so an element no longer has a size.
ALTER TABLE "dashboard_widgets" DROP COLUMN "size";--> statement-breakpoint
DROP TYPE "public"."dashboard_widget_size";
