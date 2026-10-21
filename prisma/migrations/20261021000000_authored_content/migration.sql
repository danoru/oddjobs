-- CreateTable
CREATE TABLE "OneShot" (
    "slug" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "draft" JSON,
    "published" JSON,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneShot_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "OneShotRevision" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "doc" JSON NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneShotRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spell" (
    "name" TEXT NOT NULL,
    "info" JSON NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Spell_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Survivor" (
    "id" TEXT NOT NULL,
    "oneshot" TEXT NOT NULL,
    "data" JSON NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survivor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OneShotRevision_slug_createdAt_idx" ON "OneShotRevision"("slug", "createdAt");

-- CreateIndex
CREATE INDEX "Survivor_oneshot_idx" ON "Survivor"("oneshot");

-- AddForeignKey
ALTER TABLE "OneShotRevision" ADD CONSTRAINT "OneShotRevision_slug_fkey" FOREIGN KEY ("slug") REFERENCES "OneShot"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
