-- The SmartESS account for this site (datalogger Q3721031635481, Saida) bills in
-- USD at 1.2 per kWh, for both purchase and generation. The app shipped with a
-- tariff of 0, which makes every savings figure come out as zero — the finance
-- page renders, it just cannot say anything.
--
-- The default is corrected for new installs, and the existing row is filled in
-- ONLY where the tariff is still 0, i.e. never configured. A tariff someone
-- actually chose is left exactly as it is.
ALTER TABLE "EnergySettings" ALTER COLUMN "gridTariff" SET DEFAULT 1.2;
ALTER TABLE "EnergySettings" ALTER COLUMN "exportTariff" SET DEFAULT 1.2;

UPDATE "EnergySettings" SET "gridTariff" = 1.2 WHERE "gridTariff" = 0;
UPDATE "EnergySettings" SET "exportTariff" = 1.2 WHERE "exportTariff" = 0;
UPDATE "EnergySettings" SET "currency" = 'USD' WHERE "currency" = 'SYP';
