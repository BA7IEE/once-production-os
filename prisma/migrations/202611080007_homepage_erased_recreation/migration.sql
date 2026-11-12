-- Forward 85. Erased ownership tombstones keep their old address unavailable,
-- while the same confirmed owner may start a fresh homepage with a new address.
BEGIN;
ALTER TABLE "professionalHomepages" DROP CONSTRAINT "professionalHomepages_workspaceId_personId_key";
CREATE UNIQUE INDEX homepage_one_live_owner ON "professionalHomepages"("workspaceId","personId") WHERE state<>'ERASED';
COMMIT;
