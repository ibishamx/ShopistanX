-- DropIndex
DROP INDEX "products_tags_idx";

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "trackInventory" BOOLEAN NOT NULL DEFAULT true;
