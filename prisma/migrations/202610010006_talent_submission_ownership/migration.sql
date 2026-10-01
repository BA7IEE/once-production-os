ALTER TABLE "talentClaims" ADD CONSTRAINT claim_account_key UNIQUE ("workspaceId",id,"talentAccountId");
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_claim_account_fk FOREIGN KEY ("workspaceId","claimId","talentAccountId") REFERENCES "talentClaims" ("workspaceId",id,"talentAccountId");
ALTER TABLE "talentConsents" ADD CONSTRAINT consent_claim_account_fk FOREIGN KEY ("workspaceId","claimId","talentAccountId") REFERENCES "talentClaims" ("workspaceId",id,"talentAccountId");
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_attribution_key UNIQUE ("workspaceId",id,"talentAccountId","consentId");
ALTER TABLE "sourceAttributions" ADD CONSTRAINT attribution_submission_owner_fk FOREIGN KEY ("workspaceId","submissionId","talentAccountId","consentId") REFERENCES "talentSubmissions" ("workspaceId",id,"talentAccountId","consentId");
