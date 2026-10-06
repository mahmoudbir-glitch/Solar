-- The datalogger details seeded earlier (PN Q3721031635481, SN, station "home",
-- firmware 3.1.1.0) came from photos of another person's system. The owner's
-- datalogger is the Wi-Fi Plug Pro-05 whose label and SmartESS account both
-- read Q0031255230580. Only rows still carrying the wrong seed are touched.
UPDATE "InverterConnection"
SET "dataloggerPn" = 'Q0031255230580',
    "dataloggerType" = 'Wi-Fi Plug Pro RTU',
    "dataloggerFirmware" = NULL,
    "dataloggerStationName" = NULL,
    "dataloggerDeviceIdentifier" = NULL,
    "dataloggerUpdateIntervalSec" = 300,
    "dataloggerCloud" = 'SmartESS / DESSMonitor'
WHERE "dataloggerPn" = 'Q3721031635481' OR "dataloggerPn" IS NULL OR "dataloggerPn" = '';
