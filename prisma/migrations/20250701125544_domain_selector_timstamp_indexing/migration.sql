-- CreateIndex
CREATE INDEX "EmailSignature_headerHash_idx" ON "EmailSignature"("headerHash");

-- CreateIndex
CREATE INDEX "EmailSignature_headerHashV2_idx" ON "EmailSignature"("headerHashV2");

-- CreateIndex
CREATE INDEX "EmailSignature_domain_selector_timestamp_idx" ON "EmailSignature"("domain", "selector", "timestamp");
