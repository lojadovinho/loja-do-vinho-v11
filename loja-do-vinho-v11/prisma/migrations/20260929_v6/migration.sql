CREATE TABLE "PaymentPriceRule" (
  "id" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'ALL',
  "installments" INTEGER,
  "adjustmentType" TEXT NOT NULL DEFAULT 'PERCENT_DISCOUNT',
  "adjustmentValue" INTEGER NOT NULL DEFAULT 0,
  "label" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentPriceRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentPriceRule_method_scope_active_idx" ON "PaymentPriceRule"("method", "scope", "active");
ALTER TABLE "Product" ADD COLUMN "pdvId" TEXT;
ALTER TABLE "Product" ADD COLUMN "pdvManaged" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "Product_pdvId_key" ON "Product"("pdvId");
CREATE TABLE "ProductPhoto" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductPhoto_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductPhoto_productId_sortOrder_idx" ON "ProductPhoto"("productId", "sortOrder");
