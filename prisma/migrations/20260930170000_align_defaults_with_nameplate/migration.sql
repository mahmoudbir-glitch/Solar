-- Align stored defaults with the hardware and the site, as evidenced by the
-- inverter rating label and the SmartESS account for datalogger Q3721031635481.
--
--   Main Load Cut Off Voltage : 44 VDC   (was 45.0)
--   Main Load Return Voltage  : 52 VDC   (was 46.0 — nowhere near the label)
--   Site                      : Saida, Lebanon (was Beirut's coordinates)
--   Currency                  : USD (was SYP; the SmartESS account bills in $)
--
-- Only DEFAULTS change here, so rows that already exist keep the values their
-- owner chose. A fresh install now starts from the real hardware instead of
-- thresholds the inverter would never honour.
ALTER TABLE "EnergySettings" ALTER COLUMN "lowDcCutoffVoltage" SET DEFAULT 44.0;
ALTER TABLE "EnergySettings" ALTER COLUMN "backToGridVoltage" SET DEFAULT 52.0;
ALTER TABLE "EnergySettings" ALTER COLUMN "latitude" SET DEFAULT 33.5911;
ALTER TABLE "EnergySettings" ALTER COLUMN "longitude" SET DEFAULT 35.4061;
ALTER TABLE "EnergySettings" ALTER COLUMN "currency" SET DEFAULT 'USD';
ALTER TABLE "DailySummary" ALTER COLUMN "currency" SET DEFAULT 'USD';
