-- DEV-06 forward migration: extend stable dictionary namespaces for structured work facts.
BEGIN;

ALTER TABLE "dictionary"
  DROP CONSTRAINT "dictionary_namespace_check";

ALTER TABLE "dictionary"
  ADD CONSTRAINT "dictionary_namespace_check"
  CHECK ("namespace" IN ('role','city','language','skill','industry','workType'));

COMMIT;
