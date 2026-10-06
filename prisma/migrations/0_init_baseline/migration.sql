-- Prisma baseline target schema for Shamsak.
-- Existing Prisma-managed production tables were verified to contain 0 rows.
-- Legacy inverter_readings is preserved intentionally.

DO $ BEGIN
  CREATE TYPE "Role" AS ENUM ('OWNER','FAMILY_MEMBER','TECHNICIAN','LOCAL_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $;
DO $ BEGIN
  CREATE TYPE "SystemStatus" AS ENUM ('NORMAL','ATTENTION_NEEDED','FAULT');
EXCEPTION WHEN duplicate_object THEN NULL; END $;

CREATE TABLE IF NOT EXISTS "EnergySettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "panelPowerW" DOUBLE PRECISION NOT NULL DEFAULT 6000,
  "batteryCapacityWh" DOUBLE PRECISION NOT NULL DEFAULT 4800,
  "gridTariff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exportTariff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'SYP',
  "gridType" TEXT NOT NULL DEFAULT 'hybrid',
  "latitude" DOUBLE PRECISION NOT NULL DEFAULT 33.8938,
  "longitude" DOUBLE PRECISION NOT NULL DEFAULT 35.5018,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Beirut',
  "panelTilt" DOUBLE PRECISION,
  "panelAzimuth" DOUBLE PRECISION,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "batteryNominalVoltage" INTEGER NOT NULL DEFAULT 48,
  "batteryChemistry" TEXT DEFAULT 'LiFePO4',
  "batteryMinReservePct" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "bulkChargeVoltage" DOUBLE PRECISION DEFAULT 56.4,
  "floatChargeVoltage" DOUBLE PRECISION DEFAULT 54.0,
  "lowDcCutoffVoltage" DOUBLE PRECISION DEFAULT 45.0,
  "backToGridVoltage" DOUBLE PRECISION DEFAULT 46.0,
  "maxChargeCurrentA" DOUBLE PRECISION DEFAULT 50,
  "outputSourcePriority" TEXT NOT NULL DEFAULT 'SBU',
  "chargerSourcePriority" TEXT NOT NULL DEFAULT 'CSO',
  "batteryMaxChargeA" DOUBLE PRECISION,
  "batteryMaxDischargeA" DOUBLE PRECISION,
  "inverterRatedPowerKw" DOUBLE PRECISION DEFAULT 8.2,
  "gridPhase" TEXT NOT NULL DEFAULT 'single',
  "retentionDays" INTEGER NOT NULL DEFAULT 365,
  "pollIntervalSec" INTEGER NOT NULL DEFAULT 10,
  "lowBatteryPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "criticalBatteryPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "gridOutageAlert" BOOLEAN NOT NULL DEFAULT true,
  "faultAlert" BOOLEAN NOT NULL DEFAULT true,
  "offlineMinutes" INTEGER NOT NULL DEFAULT 10,
  "overloadPct" DOUBLE PRECISION NOT NULL DEFAULT 90,
  "channels" TEXT NOT NULL DEFAULT 'in_app',
  "quietHoursStart" TEXT,
  "quietHoursEnd" TEXT,
  CONSTRAINT "EnergySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InverterConnection" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "systemName" TEXT NOT NULL DEFAULT 'منظومة شمسك',
  "inverterModel" TEXT NOT NULL DEFAULT 'NEXT - Victor Max 8.2KW',
  "serialNumber" TEXT,
  "manufacturer" TEXT,
  "dataloggerPn" TEXT,
  "dataloggerType" TEXT,
  "dataloggerFirmware" TEXT,
  "dataloggerStationName" TEXT,
  "dataloggerDeviceIdentifier" TEXT,
  "dataloggerUpdateIntervalSec" INTEGER,
  "dataloggerCloud" TEXT,
  "protocol" TEXT NOT NULL DEFAULT 'Wi-Fi Datalogger',
  "inverterAddress" TEXT,
  "serialPort" TEXT,
  "port" INTEGER,
  "baudRate" INTEGER NOT NULL DEFAULT 9600,
  "dataBits" INTEGER NOT NULL DEFAULT 8,
  "stopBits" INTEGER NOT NULL DEFAULT 1,
  "parity" TEXT NOT NULL DEFAULT 'N',
  "slaveId" INTEGER NOT NULL DEFAULT 1,
  "timeoutMs" INTEGER NOT NULL DEFAULT 1000,
  "pollingIntervalMs" INTEGER NOT NULL DEFAULT 10000,
  "gatewayUrl" TEXT,
  "inverterUsername" TEXT,
  "inverterLinkCode" TEXT,
  "wifiSsid" TEXT,
  "wifiPasswordCipher" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "connectionMode" TEXT NOT NULL DEFAULT 'gateway',
  "gatewayName" TEXT,
  "gatewayTokenHash" TEXT,
  "gatewayTokenCreatedAt" TIMESTAMPTZ,
  "lastTestResult" TEXT,
  "lastTestLatencyMs" INTEGER,
  "lastTestReason" TEXT,
  "lastStatus" TEXT NOT NULL DEFAULT 'disconnected',
  "lastSeenAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "InverterConnection_pkey" PRIMARY KEY ("id")
);

-- Shamsak production baseline: target schema reconciliation.
-- Safe for the currently verified production state: the Prisma-managed tables
-- currently contain 0 rows. Existing legacy inverter_readings is preserved.

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('OWNER','FAMILY_MEMBER','TECHNICIAN','LOCAL_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SystemStatus" AS ENUM ('NORMAL','ATTENTION_NEEDED','FAULT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Household" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Membership" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'FAMILY_MEMBER',
  "expiresAt" TIMESTAMPTZ,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX IF NOT EXISTS "Membership_householdId_idx" ON "Membership"("householdId");

CREATE TABLE IF NOT EXISTS "Site" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "householdId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "installation" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Site_householdId_idx" ON "Site"("householdId");

CREATE TABLE IF NOT EXISTS "SolarSystem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacityKw" DOUBLE PRECISION NOT NULL,
  "status" "SystemStatus" NOT NULL DEFAULT 'NORMAL',
  CONSTRAINT "SolarSystem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SolarSystem_siteId_idx" ON "SolarSystem"("siteId");

CREATE TABLE IF NOT EXISTS "EnergyReading" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "systemId" TEXT NOT NULL,
  "solarKw" DOUBLE PRECISION NOT NULL,
  "consumptionKw" DOUBLE PRECISION NOT NULL,
  "batteryPct" DOUBLE PRECISION NOT NULL,
  "gridKw" DOUBLE PRECISION NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "EnergyReading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EnergyReading_systemId_timestamp_idx" ON "EnergyReading"("systemId","timestamp");

CREATE TABLE IF NOT EXISTS "TelemetryLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "pvPowerW" DOUBLE PRECISION NOT NULL,
  "loadPowerW" DOUBLE PRECISION NOT NULL,
  "batterySoc" DOUBLE PRECISION NOT NULL,
  "batteryPowerW" DOUBLE PRECISION NOT NULL,
  "batteryVoltage" DOUBLE PRECISION,
  "batteryCurrent" DOUBLE PRECISION,
  "batteryTemperature" DOUBLE PRECISION,
  "gridConnected" BOOLEAN NOT NULL,
  "gridPowerW" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'inverter',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "TelemetryLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelemetryLog_timestamp_key" ON "TelemetryLog"("timestamp");
CREATE INDEX IF NOT EXISTS "TelemetryLog_timestamp_idx" ON "TelemetryLog"("timestamp");

CREATE TABLE IF NOT EXISTS "DailySummary" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "day" TIMESTAMPTZ NOT NULL,
  "solarKWh" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "homeKWh" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "batteryChargeKWh" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "batteryDischargeKWh" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "gridImportKWh" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "gridExportKWh" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "savings" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'SYP',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailySummary_day_key" ON "DailySummary"("day");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId","timestamp");

CREATE TABLE IF NOT EXISTS "MonitoringEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "username" TEXT,
  "action" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "details" TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "MonitoringEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MonitoringEvent_timestamp_idx" ON "MonitoringEvent"("timestamp");
CREATE INDEX IF NOT EXISTS "MonitoringEvent_action_timestamp_idx" ON "MonitoringEvent"("action","timestamp");

ALTER TABLE "EnergySettings" ALTER COLUMN "batteryCapacityWh" SET DEFAULT 4800;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "batteryNominalVoltage" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "batteryChemistry" TEXT DEFAULT 'LiFePO4';
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "batteryMinReservePct" DOUBLE PRECISION NOT NULL DEFAULT 20;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "bulkChargeVoltage" DOUBLE PRECISION DEFAULT 56.4;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "floatChargeVoltage" DOUBLE PRECISION DEFAULT 54.0;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "lowDcCutoffVoltage" DOUBLE PRECISION DEFAULT 45.0;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "backToGridVoltage" DOUBLE PRECISION DEFAULT 46.0;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "maxChargeCurrentA" DOUBLE PRECISION DEFAULT 50;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "outputSourcePriority" TEXT NOT NULL DEFAULT 'SBU';
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "chargerSourcePriority" TEXT NOT NULL DEFAULT 'CSO';
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "batteryMaxChargeA" DOUBLE PRECISION;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "batteryMaxDischargeA" DOUBLE PRECISION;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "inverterRatedPowerKw" DOUBLE PRECISION DEFAULT 8.2;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "gridPhase" TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "retentionDays" INTEGER NOT NULL DEFAULT 365;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "pollIntervalSec" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "lowBatteryPct" DOUBLE PRECISION NOT NULL DEFAULT 20;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "criticalBatteryPct" DOUBLE PRECISION NOT NULL DEFAULT 10;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "gridOutageAlert" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "faultAlert" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "offlineMinutes" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "overloadPct" DOUBLE PRECISION NOT NULL DEFAULT 90;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "channels" TEXT NOT NULL DEFAULT 'in_app';
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "quietHoursStart" TEXT;
ALTER TABLE "EnergySettings" ADD COLUMN IF NOT EXISTS "quietHoursEnd" TEXT;

ALTER TABLE "InverterConnection" ALTER COLUMN "inverterModel" SET DEFAULT 'NEXT - Victor Max 8.2KW';
ALTER TABLE "InverterConnection" ALTER COLUMN "protocol" SET DEFAULT 'Wi-Fi Datalogger';
ALTER TABLE "InverterConnection" ALTER COLUMN "timeoutMs" SET DEFAULT 1000;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "serialNumber" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "manufacturer" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataloggerPn" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataloggerType" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataloggerFirmware" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataloggerStationName" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataloggerDeviceIdentifier" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataloggerUpdateIntervalSec" INTEGER;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataloggerCloud" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "serialPort" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "port" INTEGER;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "baudRate" INTEGER NOT NULL DEFAULT 9600;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "dataBits" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "stopBits" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "parity" TEXT NOT NULL DEFAULT 'N';
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "slaveId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "pollingIntervalMs" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "gatewayUrl" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "connectionMode" TEXT NOT NULL DEFAULT 'gateway';
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "gatewayName" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "gatewayTokenHash" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "gatewayTokenCreatedAt" TIMESTAMPTZ;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "lastTestResult" TEXT;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "lastTestLatencyMs" INTEGER;
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "lastTestReason" TEXT;

DO $$ BEGIN
  ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Membership" ADD CONSTRAINT "Membership_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Site" ADD CONSTRAINT "Site_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SolarSystem" ADD CONSTRAINT "SolarSystem_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EnergyReading" ADD CONSTRAINT "EnergyReading_systemId_fkey"
    FOREIGN KEY ("systemId") REFERENCES "SolarSystem"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
