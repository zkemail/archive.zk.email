/*
  Warnings:

  - A unique constraint covering the columns `[headerHashV2,dkimSignature]` on the table `EmailSignature` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "EmailSignature_headerHashV2_idx";

-- DropIndex
DROP INDEX "EmailSignature_headerHash_idx";

-- CreateIndex
CREATE INDEX "EmailSignature_headerHashV2_dkimSignature_idx" ON "EmailSignature"("headerHashV2", "dkimSignature");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSignature_headerHashV2_dkimSignature_key" ON "EmailSignature"("headerHashV2", "dkimSignature");
