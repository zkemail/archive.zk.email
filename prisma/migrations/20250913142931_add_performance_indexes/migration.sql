-- CreateIndex
CREATE INDEX "DkimRecord_domainSelectorPairId_idx" ON "DkimRecord"("domainSelectorPairId");

-- CreateIndex
CREATE INDEX "DomainSelectorPair_domain_selector_idx" ON "DomainSelectorPair"("domain", "selector");
