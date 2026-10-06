-- Owner, 3 Oct 2026: the panels face south-west, 30 degrees west of south
-- (compass bearing 210). The tilt was not given; 25 degrees, the usual fixed
-- rack angle around Saida, is used until the owner corrects it in Settings.
-- With both set, the forecast uses irradiance on the tilted panel plane instead
-- of on flat ground. Only filled in where never configured.
UPDATE "EnergySettings"
SET "panelTilt" = 25, "panelAzimuth" = 210
WHERE "panelTilt" IS NULL AND "panelAzimuth" IS NULL;

-- Owner: 48 V, 100 Ah lithium iron phosphate.
UPDATE "EnergySettings" SET "batteryChemistry" = 'LiFePO4' WHERE "batteryChemistry" IS NULL OR "batteryChemistry" = '';
