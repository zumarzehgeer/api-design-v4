-- Preserve the original course migration; apply release workflow changes additively.
ALTER TABLE "Update" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UpdatePoint" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Update" DROP CONSTRAINT "Update_productId_fkey";
ALTER TABLE "Update" ADD CONSTRAINT "Update_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UpdatePoint" DROP CONSTRAINT "UpdatePoint_updateId_fkey";
ALTER TABLE "UpdatePoint" ADD CONSTRAINT "UpdatePoint_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Product_belongsToId_createdAt_id_idx" ON "Product"("belongsToId", "createdAt", "id");
CREATE INDEX "Update_productId_createdAt_id_idx" ON "Update"("productId", "createdAt", "id");
CREATE INDEX "UpdatePoint_updateId_createdAt_id_idx" ON "UpdatePoint"("updateId", "createdAt", "id");
