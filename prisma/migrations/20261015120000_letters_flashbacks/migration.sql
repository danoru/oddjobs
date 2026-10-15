-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "letterId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashback" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flashback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_tableId_letterId_key" ON "Delivery"("tableId", "letterId");

-- CreateIndex
CREATE UNIQUE INDEX "Flashback_tableId_characterId_key" ON "Flashback"("tableId", "characterId");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashback" ADD CONSTRAINT "Flashback_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
