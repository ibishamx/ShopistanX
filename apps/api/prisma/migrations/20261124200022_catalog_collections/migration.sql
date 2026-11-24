-- CreateEnum
CREATE TYPE "CollectionKind" AS ENUM ('MANUAL', 'SMART');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "productType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "vendor" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "kind" "CollectionKind" NOT NULL DEFAULT 'MANUAL',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "matchAll" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" TEXT NOT NULL DEFAULT 'newest',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "showInMenu" BOOLEAN NOT NULL DEFAULT false,
    "menuPosition" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "tenant_id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "collections_tenant_id_id_key" ON "collections"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_tenant_id_handle_key" ON "collections"("tenant_id", "handle");

-- CreateIndex
CREATE INDEX "collection_products_tenant_id_productId_idx" ON "collection_products"("tenant_id", "productId");

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_tenant_id_collectionId_fkey" FOREIGN KEY ("tenant_id", "collectionId") REFERENCES "collections"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_tenant_id_productId_fkey" FOREIGN KEY ("tenant_id", "productId") REFERENCES "products"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation for the new tables (same policy as every tenant table).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['collections', 'collection_products'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_setting(''app.tenant_id'')::uuid)
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'')::uuid)', t);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
      t, t || '_tenant_fk');
  END LOOP;
END $$;

-- Product search in the admin and the storefront.
CREATE INDEX products_tags_idx ON products USING GIN (tags);
