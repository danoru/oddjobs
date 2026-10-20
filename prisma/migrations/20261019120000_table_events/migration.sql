-- CreateTable
CREATE TABLE "TableEvent" (
    "id" SERIAL NOT NULL,
    "tableId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "byPlayer" TEXT,
    "toPlayer" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epilogue" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "tapestry" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epilogue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableEvent_tableId_id_idx" ON "TableEvent"("tableId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Epilogue_tableId_key" ON "Epilogue"("tableId");

-- AddForeignKey
ALTER TABLE "TableEvent" ADD CONSTRAINT "TableEvent_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epilogue" ADD CONSTRAINT "Epilogue_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
