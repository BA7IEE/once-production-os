-- Forward migration 76. Preserve original employee reviews; self confirmation is
-- a distinct, real TalentAccount principal and never a synthetic Membership.
BEGIN;
ALTER TABLE sources ADD COLUMN "confirmedByTalentId" uuid, ADD COLUMN "selfConfirmedAt" timestamptz(3);
ALTER TABLE sources ADD CONSTRAINT sources_self_account_fk FOREIGN KEY ("workspaceId","confirmedByTalentId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE sources ADD CONSTRAINT sources_self_pair CHECK (("confirmedByTalentId" IS NULL)=("selfConfirmedAt" IS NULL));
DO $$
DECLARE constraint_name text; matches integer;
BEGIN
 SELECT count(*),min(conname) INTO matches,constraint_name FROM pg_constraint
 WHERE conrelid='sources'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%CONFIRMED%' AND pg_get_constraintdef(oid) LIKE '%reviewedBy%';
 IF matches<>1 THEN RAISE EXCEPTION 'expected exactly one original source confirmation check'; END IF;
 EXECUTE format('ALTER TABLE sources DROP CONSTRAINT %I',constraint_name);
END; $$;
ALTER TABLE sources ADD CONSTRAINT sources_confirmation_actor CHECK ((status<>'CONFIRMED' OR
 ("basisMode"='INTERNAL_USE' AND (("reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL)
 OR ("confirmedByTalentId" IS NOT NULL AND "selfConfirmedAt" IS NOT NULL)))) IS TRUE);

ALTER TABLE "sourceHistory" ADD COLUMN "talentAccountId" uuid;
ALTER TABLE "sourceHistory" ADD CONSTRAINT history_self_actor_fk FOREIGN KEY ("workspaceId","talentAccountId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceHistory" DROP CONSTRAINT "sourceHistory_decision_check";
ALTER TABLE "sourceHistory" ADD CONSTRAINT "sourceHistory_decision_check" CHECK ((
 ("baselineOnly" AND action='BASELINE' AND "actorId" IS NULL AND "talentAccountId" IS NULL AND "decisionReason" IS NULL)
 OR (NOT "baselineOnly" AND action<>'BASELINE' AND num_nonnulls("actorId","talentAccountId")=1
 AND ("talentAccountId" IS NULL OR action='CREATED')
 AND ((action IN ('SUSPENDED','DELETION_BLOCKED') AND "decisionReason" IS NOT NULL)
 OR (action NOT IN ('SUSPENDED','DELETION_BLOCKED') AND "decisionReason" IS NULL)))) IS TRUE);
CREATE OR REPLACE FUNCTION once_source_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.snapshot->>'erased' IS DISTINCT FROM 'true'
 AND NEW.snapshot=jsonb_build_object('id',OLD."sourceId"::text,'workspaceId',OLD."workspaceId"::text,'revision',OLD."sourceRevision",'scopeId',OLD."scopeId"::text,'erased',true)
 AND (NEW.id,NEW."workspaceId",NEW.revision,NEW."sourceId",NEW."sourceRevision",NEW."scopeId",NEW."actorId",NEW."talentAccountId",NEW.action,NEW."baselineOnly",NEW."basisAmbiguous",NEW."createdAt")
 IS NOT DISTINCT FROM (OLD.id,OLD."workspaceId",OLD.revision,OLD."sourceId",OLD."sourceRevision",OLD."scopeId",OLD."actorId",OLD."talentAccountId",OLD.action,OLD."baselineOnly",OLD."basisAmbiguous",OLD."createdAt")
 AND NEW."decisionReason" IS NOT DISTINCT FROM (CASE WHEN OLD."decisionReason" IS NULL THEN NULL::text ELSE '[ERASED]' END)
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'sourceHistory is append-only; only one-way payload redaction is allowed' USING ERRCODE='55000';
END; $$;

ALTER TABLE "talentClaims" ADD COLUMN "confirmedByTalentId" uuid;
ALTER TABLE "talentClaims" ADD CONSTRAINT claim_self_actor_fk FOREIGN KEY ("workspaceId","confirmedByTalentId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentClaims" ADD CONSTRAINT claim_self_confirmation CHECK (("confirmedByTalentId" IS NULL OR
 ("confirmedByTalentId"="talentAccountId" AND relation='SELF' AND state='APPROVED' AND NOT reserved
 AND "decidedById" IS NULL AND "decidedAt" IS NOT NULL AND "targetPersonId" IS NOT NULL AND length(trim("ownershipBasis"))>0)) IS TRUE);

ALTER TABLE "talentAccessGrants" ALTER COLUMN "approvedById" DROP NOT NULL, ADD COLUMN "confirmedByTalentId" uuid;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT grant_self_actor_fk FOREIGN KEY ("workspaceId","confirmedByTalentId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentAccessGrants" ADD CONSTRAINT grant_decision_actor CHECK ((num_nonnulls("approvedById","confirmedByTalentId")=1
 AND ("confirmedByTalentId" IS NULL OR relation='SELF' AND "confirmedByTalentId"="talentAccountId")) IS TRUE);

ALTER TABLE "talentSubmissions" ADD COLUMN "confirmedByTalentId" uuid;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_self_actor_fk FOREIGN KEY ("workspaceId","confirmedByTalentId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "talentSubmissions" ADD CONSTRAINT submission_self_confirmation CHECK (("confirmedByTalentId" IS NULL OR
 ("principalKind"='TALENT' AND "confirmedByTalentId"="talentAccountId" AND state='APPROVED' AND "decidedById" IS NULL
 AND "decidedAt" IS NOT NULL AND "personId" IS NOT NULL AND "grantId" IS NOT NULL)) IS TRUE);

ALTER TABLE "sourceAttributions" ALTER COLUMN "reviewerId" DROP NOT NULL, ADD COLUMN "confirmedByTalentId" uuid;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT attribution_self_actor_fk FOREIGN KEY ("workspaceId","confirmedByTalentId") REFERENCES "talentAccounts"("workspaceId",id) ON DELETE RESTRICT;
ALTER TABLE "sourceAttributions" ADD CONSTRAINT attribution_decision_actor CHECK ((num_nonnulls("reviewerId","confirmedByTalentId")=1
 AND ("confirmedByTalentId" IS NULL OR "principalKind"='TALENT' AND "confirmedByTalentId"="talentAccountId" AND "importedBasis" IS NULL)) IS TRUE);

-- Deferred: source, decision, consent-backed attribution and history are written
-- together in one command. A dangling 'self confirmed' source cannot commit.
CREATE FUNCTION supplier_self_source_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src sources;
BEGIN
 SELECT * INTO src FROM sources WHERE id=NEW.id;
 IF src."confirmedByTalentId" IS NOT NULL AND src.status<>'ERASED' AND NOT EXISTS (
  SELECT 1 FROM "sourceAttributions" a
  JOIN "talentSubmissions" s ON s.id=a."submissionId" AND s."workspaceId"=a."workspaceId"
  JOIN "sourceHistory" h ON h."sourceId"=src.id AND h."workspaceId"=src."workspaceId" AND h."sourceRevision"=1 AND h.action='CREATED'
  WHERE a."sourceId"=src.id AND a."workspaceId"=src."workspaceId" AND a."confirmedByTalentId"=src."confirmedByTalentId"
  AND a."reviewerId" IS NULL AND s."confirmedByTalentId"=src."confirmedByTalentId" AND s.state='APPROVED'
  AND s."decidedAt"=src."selfConfirmedAt" AND h."talentAccountId"=src."confirmedByTalentId" AND h."actorId" IS NULL
 ) THEN RAISE EXCEPTION 'self confirmation requires matching real decision and source history' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER supplier_self_source_gate AFTER INSERT OR UPDATE ON sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION supplier_self_source_gate();
INSERT INTO dictionary (id,"workspaceId",revision,"createdAt","updatedAt",namespace,code,"labelZh","labelEn",status)
SELECT gen_random_uuid(),w.id,1,now(),now(),s.namespace,s.code,s.zh,s.en,'ACTIVE'
FROM workspaces w CROSS JOIN (VALUES
 ('role','screenwriter','编剧','Screenwriter'),('role','lighting','灯光师','Lighting technician'),('role','colorist','调色师','Colorist'),
 ('role','sound','录音师','Sound recordist'),('role','art_director','美术指导','Art director'),
 ('city','beijing','北京','Beijing'),('city','shanghai','上海','Shanghai'),('city','hangzhou','杭州','Hangzhou'),('city','chengdu','成都','Chengdu')
) s(namespace,code,zh,en)
WHERE NOT EXISTS (SELECT 1 FROM dictionary d WHERE d."workspaceId"=w.id AND d.namespace=s.namespace AND d.code=s.code);
COMMIT;
