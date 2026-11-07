-- Forward 78: immutable field metadata and typed, source-bound extension facts.
BEGIN;
ALTER TABLE "personCredentials" ADD COLUMN "credentialName" text CHECK ("credentialName" IS NULL OR length("credentialName") BETWEEN 1 AND 200);
CREATE TABLE "supplierCatalogs" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL REFERENCES workspaces(id),"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),
 version integer NOT NULL CHECK(version>0),"baseVersion" integer,state text NOT NULL CHECK(state IN ('DRAFT','PUBLISHED')),definition jsonb NOT NULL,
 "definitionDigest" text NOT NULL CHECK("definitionDigest" ~ '^[a-f0-9]{64}$'),"publishedById" uuid,"publishedAt" timestamptz(3),"publishReason" text NOT NULL,origin text NOT NULL CHECK(origin IN ('SYSTEM','MEMBER')),
 UNIQUE("workspaceId",id),UNIQUE("workspaceId",version),
 FOREIGN KEY("workspaceId","publishedById") REFERENCES memberships("workspaceId",id),
 FOREIGN KEY("workspaceId","baseVersion") REFERENCES "supplierCatalogs"("workspaceId",version),
 CHECK(jsonb_typeof(definition)='object' AND octet_length(definition::text)<=1048576),
 CHECK((state='DRAFT' AND "publishedAt" IS NULL AND "publishedById" IS NULL) OR
  (state='PUBLISHED' AND "publishedAt" IS NOT NULL AND ((origin='SYSTEM' AND version=1 AND "publishedById" IS NULL) OR (origin='MEMBER' AND "publishedById" IS NOT NULL))))
);
CREATE FUNCTION once_supplier_catalog_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='PUBLISHED' THEN RAISE EXCEPTION 'FIELD_CATALOG_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND (NEW."workspaceId"<>OLD."workspaceId" OR NEW.version<>OLD.version OR NEW."baseVersion" IS DISTINCT FROM OLD."baseVersion") THEN RAISE EXCEPTION 'FIELD_CATALOG_IDENTITY_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER supplier_catalog_immutable BEFORE UPDATE OR DELETE ON "supplierCatalogs" FOR EACH ROW EXECUTE FUNCTION once_supplier_catalog_immutable();
CREATE TABLE "supplierFacts" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),
 "personId" uuid NOT NULL,"personRoleId" uuid,"roleCode" text,"sourceId" uuid NOT NULL,"sourceRevision" integer NOT NULL CHECK("sourceRevision">0),"catalogVersion" integer NOT NULL,
 "setId" uuid NOT NULL,"fieldCode" text NOT NULL,"recordKey" text NOT NULL,"componentCode" text NOT NULL,"valueType" text NOT NULL CHECK("valueType" IN ('STATE','TEXT','NUMBER','BOOLEAN','DATE','CODE','CODE_SET')),
 "valueState" text NOT NULL CHECK("valueState" IN ('KNOWN','DECLARED_NONE','UNKNOWN','NOT_PROVIDED')),
 "numberValue" double precision,"booleanValue" boolean,"dateValue" text,"codeValue" text,"textCiphertext" text,
 status text NOT NULL CHECK(status IN ('ACTIVE','RETIRED')),visibility text NOT NULL CHECK(visibility IN ('SELF_SHARED','INTERNAL')),
 UNIQUE("workspaceId",id),
 FOREIGN KEY("workspaceId","setId") REFERENCES "supplierFacts"("workspaceId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","personId") REFERENCES people("workspaceId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","sourceId") REFERENCES sources("workspaceId",id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","personId","personRoleId") REFERENCES "personRoles"("workspaceId","personId",id) ON DELETE SET NULL ("personRoleId") DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("workspaceId","catalogVersion") REFERENCES "supplierCatalogs"("workspaceId",version),
 CHECK("personRoleId" IS NULL OR "roleCode" IS NOT NULL),
 CHECK("dateValue" IS NULL OR "dateValue" ~ '^\d{4}-\d{2}-\d{2}$' AND to_char("dateValue"::date,'YYYY-MM-DD')="dateValue"),
 CHECK("numberValue" IS NULL OR "numberValue" NOT IN ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8)),
 CHECK(("valueState"<>'KNOWN' AND num_nonnulls("numberValue","booleanValue","dateValue","codeValue","textCiphertext")=0) OR
  ("valueState"='KNOWN' AND CASE "valueType"
   WHEN 'NUMBER' THEN "numberValue" IS NOT NULL AND num_nonnulls("numberValue","booleanValue","dateValue","codeValue","textCiphertext")=1
   WHEN 'BOOLEAN' THEN "booleanValue" IS NOT NULL AND num_nonnulls("numberValue","booleanValue","dateValue","codeValue","textCiphertext")=1
   WHEN 'DATE' THEN "dateValue" IS NOT NULL AND num_nonnulls("numberValue","booleanValue","dateValue","codeValue","textCiphertext")=1
   WHEN 'CODE' THEN "codeValue" IS NOT NULL AND num_nonnulls("numberValue","booleanValue","dateValue","codeValue","textCiphertext")=1
   WHEN 'TEXT' THEN "textCiphertext" IS NOT NULL AND num_nonnulls("numberValue","booleanValue","dateValue","codeValue","textCiphertext")=1
   ELSE num_nonnulls("numberValue","booleanValue","dateValue","codeValue","textCiphertext")=0 END))
);
CREATE UNIQUE INDEX supplier_fact_cell_key ON "supplierFacts"("workspaceId","setId","recordKey","componentCode");
CREATE INDEX "supplierFacts_workspaceId_personId_status_idx" ON "supplierFacts"("workspaceId","personId",status);
CREATE INDEX "supplierFacts_workspaceId_sourceId_idx" ON "supplierFacts"("workspaceId","sourceId");
CREATE INDEX "supplierFacts_workspaceId_fieldCode_numberValue_idx" ON "supplierFacts"("workspaceId","fieldCode","numberValue");
CREATE TABLE "supplierFactChoices" (
 id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"createdAt" timestamptz(3) NOT NULL,"updatedAt" timestamptz(3) NOT NULL,revision integer NOT NULL CHECK(revision>0),"factId" uuid NOT NULL,code text NOT NULL,
 FOREIGN KEY("workspaceId","factId") REFERENCES "supplierFacts"("workspaceId",id) ON DELETE CASCADE,
 UNIQUE("workspaceId","factId",code)
);
CREATE INDEX "supplierFactChoices_workspaceId_code_factId_idx" ON "supplierFactChoices"("workspaceId",code,"factId");

CREATE FUNCTION once_supplier_fact_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE catalog jsonb; f jsonb; c jsonb; actual_role text;
BEGIN
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['revision','updatedAt','status','personRoleId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updatedAt','status','personRoleId'])
   OR (NEW."personRoleId" IS DISTINCT FROM OLD."personRoleId" AND NEW."personRoleId" IS NOT NULL)
   OR (OLD.status='RETIRED' AND NEW.status<>'RETIRED')) THEN RAISE EXCEPTION 'SUPPLIER_FACT_IMMUTABLE'; END IF;
 SELECT definition INTO catalog FROM "supplierCatalogs" WHERE "workspaceId"=NEW."workspaceId" AND version=NEW."catalogVersion" AND state='PUBLISHED';
 SELECT item INTO f FROM jsonb_array_elements(catalog->'fields') item WHERE item->>'code'=NEW."fieldCode";
 IF f IS NULL OR f->>'visibility'<>NEW.visibility OR (f->>'owner'='PERSON' AND (NEW."roleCode" IS NOT NULL OR NEW."personRoleId" IS NOT NULL))
   OR (f->>'owner'='ROLE' AND NEW."roleCode" IS NULL) OR (TG_OP='INSERT' AND f->>'owner'='ROLE' AND NEW."personRoleId" IS NULL) THEN RAISE EXCEPTION 'SUPPLIER_FACT_CATALOG_INVALID'; END IF;
 IF NEW."personRoleId" IS NOT NULL THEN
   SELECT "roleCode" INTO actual_role FROM "personRoles" WHERE "workspaceId"=NEW."workspaceId" AND "personId"=NEW."personId" AND id=NEW."personRoleId";
   IF actual_role IS DISTINCT FROM NEW."roleCode" THEN RAISE EXCEPTION 'SUPPLIER_FACT_ROLE_INVALID'; END IF;
 END IF;
 IF NEW."recordKey"='single' THEN
   c=f;
   IF NEW.id<>NEW."setId" OR NEW."componentCode"<>'value' OR NEW."valueType"<>(CASE WHEN f->>'type'='RECORDS' THEN 'STATE' ELSE f->>'type' END) THEN RAISE EXCEPTION 'SUPPLIER_FACT_TYPE_INVALID'; END IF;
 ELSE
   IF f->>'type'<>'RECORDS' OR NEW."recordKey" !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'SUPPLIER_FACT_RECORD_INVALID'; END IF;
   SELECT item INTO c FROM jsonb_array_elements(f->'components') item WHERE item->>'code'=NEW."componentCode";
   IF c IS NULL OR c->>'type'<>NEW."valueType" OR NEW."valueState"<>'KNOWN' THEN RAISE EXCEPTION 'SUPPLIER_FACT_COMPONENT_INVALID'; END IF;
 END IF;
 IF NEW."valueState"='DECLARED_NONE' AND c->>'type' NOT IN ('CODE_SET','RECORDS') THEN RAISE EXCEPTION 'SUPPLIER_FACT_STATE_INVALID'; END IF;
 IF NEW."valueState"='KNOWN' AND NEW."valueType"='CODE' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'options') o WHERE o->>'code'=NEW."codeValue") THEN RAISE EXCEPTION 'SUPPLIER_FACT_OPTION_INVALID'; END IF;
 IF NEW."valueState"='KNOWN' AND NEW."valueType"='NUMBER' AND ((c ? 'min' AND NEW."numberValue"<(c->>'min')::float8) OR (c ? 'max' AND NEW."numberValue">(c->>'max')::float8)) THEN RAISE EXCEPTION 'SUPPLIER_FACT_RANGE_INVALID'; END IF;
 IF NEW."textCiphertext" IS NOT NULL AND octet_length(NEW."textCiphertext")>40000 THEN RAISE EXCEPTION 'SUPPLIER_FACT_TEXT_LIMIT'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER supplier_fact_metadata BEFORE INSERT OR UPDATE ON "supplierFacts" FOR EACH ROW EXECUTE FUNCTION once_supplier_fact_metadata();
CREATE FUNCTION once_supplier_fact_set() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row "supplierFacts"; root "supplierFacts"; catalog jsonb; f jsonb; c jsonb; n integer;
BEGIN
 IF TG_TABLE_NAME='supplierFactChoices' THEN SELECT * INTO row FROM "supplierFacts" WHERE id=coalesce(NEW."factId",OLD."factId");
 ELSIF TG_OP='DELETE' THEN SELECT * INTO row FROM "supplierFacts" WHERE id=OLD."setId"; ELSE SELECT * INTO row FROM "supplierFacts" WHERE id=NEW.id; END IF;
 IF row.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO root FROM "supplierFacts" WHERE id=row."setId";
 IF root.id IS NULL OR root."recordKey"<>'single' OR root."workspaceId"<>row."workspaceId" OR root."sourceId"<>row."sourceId" OR root."sourceRevision"<>row."sourceRevision" OR root."personId"<>row."personId" OR root."personRoleId" IS DISTINCT FROM row."personRoleId" OR root."catalogVersion"<>row."catalogVersion" OR root."fieldCode"<>row."fieldCode" THEN RAISE EXCEPTION 'SUPPLIER_FACT_SET_INVALID'; END IF;
 SELECT definition INTO catalog FROM "supplierCatalogs" WHERE "workspaceId"=row."workspaceId" AND version=row."catalogVersion";
 SELECT item INTO f FROM jsonb_array_elements(catalog->'fields') item WHERE item->>'code'=row."fieldCode";
 IF row."recordKey"='single' THEN c=f; ELSE SELECT item INTO c FROM jsonb_array_elements(f->'components') item WHERE item->>'code'=row."componentCode"; END IF;
 SELECT count(*) INTO n FROM "supplierFactChoices" WHERE "factId"=row.id;
 IF row."valueType"='CODE_SET' AND row."valueState"='KNOWN' THEN
   IF n<1 OR n>coalesce((c->>'maxItems')::integer,30) OR EXISTS(SELECT 1 FROM "supplierFactChoices" ch WHERE ch."factId"=row.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'options') o WHERE o->>'code'=ch.code)) THEN RAISE EXCEPTION 'SUPPLIER_FACT_CHOICES_INVALID'; END IF;
 ELSIF n<>0 THEN RAISE EXCEPTION 'SUPPLIER_FACT_CHOICES_INVALID'; END IF;
 IF row.id=root.id AND row."valueType"='STATE' AND row."valueState"='KNOWN' THEN
  SELECT count(DISTINCT "recordKey") INTO n FROM "supplierFacts" WHERE "setId"=row.id AND id<>row.id;
  IF n<1 OR n>coalesce((f->>'maxItems')::integer,30) THEN RAISE EXCEPTION 'SUPPLIER_FACT_RECORD_LIMIT'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER supplier_fact_set AFTER INSERT OR UPDATE OR DELETE ON "supplierFacts" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_supplier_fact_set();
CREATE CONSTRAINT TRIGGER supplier_fact_choices AFTER INSERT OR UPDATE OR DELETE ON "supplierFactChoices" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION once_supplier_fact_set();
COMMIT;
