-- Solar keeps its own name for a new installation; rows already named by the owner are untouched.
ALTER TABLE "InverterConnection" ALTER COLUMN "systemName" SET DEFAULT 'منظومة Solar';
UPDATE "InverterConnection" SET "systemName" = 'منظومة Solar' WHERE "systemName" = 'منظومة شمسك';
