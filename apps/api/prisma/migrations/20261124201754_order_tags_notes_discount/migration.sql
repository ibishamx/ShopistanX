-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discountPaisa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "merchantNote" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "orders_tags_idx" ON "orders" USING GIN ("tags");
