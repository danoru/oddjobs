-- Phase 11: running a one-shot is a game.
--
-- Written by hand, not by `migrate diff`: Prisma can't express a rename, and
-- its diff would drop "Table" (and every claim, letter and event with it) and
-- create "Game" empty. Everything here renames in place, so it keeps every
-- row; the names follow what Prisma generates, so later diffs see no drift.
--
-- 1. The Ten Candles state row ("Game") becomes "GameState", freeing the name.
-- 2. "Table" becomes "Game", and every "tableId" becomes "gameId".
-- 3. New columns and tables: the GM, status, schedule, seats, pinned content,
--    co-GMs, spoilers, seats held by accounts, invites for guest seats.
-- 4. Data: every table from before games is a finished game run by the first
--    admin (epilogued if it has a morning-after), the admin knows its
--    secrets, and every claim stays a guest seat (no account), under the same
--    browser key, so its history can still be claimed through an invite.

BEGIN;

-- 1. Game -> GameState --------------------------------------------------------
ALTER TABLE "Game" RENAME TO "GameState";
ALTER TABLE "GameState" RENAME CONSTRAINT "Game_pkey" TO "GameState_pkey";
ALTER TABLE "GameState" RENAME COLUMN "tableId" TO "gameId";
ALTER INDEX "Game_tableId_key" RENAME TO "GameState_gameId_key";
ALTER TABLE "GameState" RENAME CONSTRAINT "Game_tableId_fkey" TO "GameState_gameId_fkey";

-- 2. Table -> Game ------------------------------------------------------------
ALTER TABLE "Table" RENAME TO "Game";
ALTER TABLE "Game" RENAME CONSTRAINT "Table_pkey" TO "Game_pkey";
ALTER INDEX "Table_code_key" RENAME TO "Game_code_key";

ALTER TABLE "Claim" RENAME COLUMN "tableId" TO "gameId";
ALTER INDEX "Claim_tableId_characterId_key" RENAME TO "Claim_gameId_characterId_key";
ALTER TABLE "Claim" RENAME CONSTRAINT "Claim_tableId_fkey" TO "Claim_gameId_fkey";

ALTER TABLE "Delivery" RENAME COLUMN "tableId" TO "gameId";
ALTER INDEX "Delivery_tableId_letterId_key" RENAME TO "Delivery_gameId_letterId_key";
ALTER TABLE "Delivery" RENAME CONSTRAINT "Delivery_tableId_fkey" TO "Delivery_gameId_fkey";

ALTER TABLE "Flashback" RENAME COLUMN "tableId" TO "gameId";
ALTER INDEX "Flashback_tableId_characterId_key" RENAME TO "Flashback_gameId_characterId_key";
ALTER TABLE "Flashback" RENAME CONSTRAINT "Flashback_tableId_fkey" TO "Flashback_gameId_fkey";

ALTER TABLE "Recording" RENAME COLUMN "tableId" TO "gameId";
ALTER INDEX "Recording_tableId_playerId_key" RENAME TO "Recording_gameId_playerId_key";
ALTER TABLE "Recording" RENAME CONSTRAINT "Recording_tableId_fkey" TO "Recording_gameId_fkey";

ALTER TABLE "TableEvent" RENAME COLUMN "tableId" TO "gameId";
ALTER INDEX "TableEvent_tableId_id_idx" RENAME TO "TableEvent_gameId_id_idx";
ALTER TABLE "TableEvent" RENAME CONSTRAINT "TableEvent_tableId_fkey" TO "TableEvent_gameId_fkey";

ALTER TABLE "Epilogue" RENAME COLUMN "tableId" TO "gameId";
ALTER INDEX "Epilogue_tableId_key" RENAME TO "Epilogue_gameId_key";
ALTER TABLE "Epilogue" RENAME CONSTRAINT "Epilogue_tableId_fkey" TO "Epilogue_gameId_fkey";

-- 3. New columns and tables ---------------------------------------------------
ALTER TABLE "Game"
ADD COLUMN "gmId" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open',
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "seats" INTEGER,
ADD COLUMN "content" JSON,
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "finishedAt" TIMESTAMP(3);

ALTER TABLE "Claim" ADD COLUMN "userId" TEXT;

ALTER TABLE "Invite"
ADD COLUMN "guestGameId" TEXT,
ADD COLUMN "guestKey" TEXT;

CREATE TABLE "GameCoGm" (
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameCoGm_pkey" PRIMARY KEY ("gameId","userId")
);

CREATE TABLE "Spoiler" (
    "userId" TEXT NOT NULL,
    "oneshot" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spoiler_pkey" PRIMARY KEY ("userId","oneshot")
);

CREATE INDEX "Game_gmId_idx" ON "Game"("gmId");
CREATE INDEX "Game_oneshot_idx" ON "Game"("oneshot");
CREATE INDEX "GameCoGm_userId_idx" ON "GameCoGm"("userId");
CREATE INDEX "Claim_userId_idx" ON "Claim"("userId");

ALTER TABLE "Game" ADD CONSTRAINT "Game_gmId_fkey" FOREIGN KEY ("gmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GameCoGm" ADD CONSTRAINT "GameCoGm_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameCoGm" ADD CONSTRAINT "GameCoGm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Spoiler" ADD CONSTRAINT "Spoiler_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_guestGameId_fkey" FOREIGN KEY ("guestGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Data: tables from before games are finished games --------------------------
-- The first admin runs them (none yet, as on a fresh database: admins only).
UPDATE "Game" SET
  "gmId" = (SELECT "id" FROM "User" WHERE "role" = 'admin' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1),
  "status" = CASE WHEN EXISTS (SELECT 1 FROM "Epilogue" e WHERE e."gameId" = "Game"."id") THEN 'epilogued' ELSE 'finished' END,
  "startedAt" = "createdAt",
  "finishedAt" = GREATEST(
    "createdAt",
    (SELECT max(ev."createdAt") FROM "TableEvent" ev WHERE ev."gameId" = "Game"."id"),
    (SELECT max(c."claimedAt") FROM "Claim" c WHERE c."gameId" = "Game"."id"),
    (SELECT max(ep."updatedAt") FROM "Epilogue" ep WHERE ep."gameId" = "Game"."id")
  );

-- Whoever ran a one-shot knows its secrets.
INSERT INTO "Spoiler" ("userId", "oneshot", "at")
SELECT "gmId", "oneshot", min("createdAt") FROM "Game" WHERE "gmId" IS NOT NULL GROUP BY "gmId", "oneshot"
ON CONFLICT DO NOTHING;

-- Claims stay as they are: no account ("userId" null) makes each one a guest seat.

COMMIT;
