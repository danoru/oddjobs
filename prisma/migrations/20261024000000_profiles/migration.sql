-- Phase 12: profiles and settings. A woodcut portrait (a small data URL made
-- in the browser) and the account's defaults for reading, dice and sound.
BEGIN;

ALTER TABLE "User" ADD COLUMN "portrait" TEXT;
ALTER TABLE "User" ADD COLUMN "prefs" JSONB;

COMMIT;
