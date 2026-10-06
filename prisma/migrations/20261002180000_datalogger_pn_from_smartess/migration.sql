-- The owner's SmartESS account (screenshots, 2 Oct 2026) lists one datalogger,
-- PN Q0045395318912, with the inverter SN Q0045395318912094801 under it. This
-- is also the device the sync has been reading all along. The PN written by the
-- earlier "correct identity" migration (Q0031255230580) does not appear in the
-- account, so rows still carrying it (or no PN) are corrected; a PN someone
-- typed in deliberately is left alone.
UPDATE "InverterConnection"
SET "dataloggerPn" = 'Q0045395318912'
WHERE "dataloggerPn" = 'Q0031255230580' OR "dataloggerPn" IS NULL OR "dataloggerPn" = '';

UPDATE "InverterConnection"
SET "dataloggerDeviceIdentifier" = 'Q0045395318912094801'
WHERE "dataloggerPn" = 'Q0045395318912'
  AND ("dataloggerDeviceIdentifier" IS NULL OR "dataloggerDeviceIdentifier" = '');
