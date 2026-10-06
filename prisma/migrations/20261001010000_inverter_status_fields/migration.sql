-- Inverter status reported by SmartESS alongside each reading.
ALTER TABLE "TelemetryLog" ADD COLUMN IF NOT EXISTS "gridVoltage" DOUBLE PRECISION;
ALTER TABLE "TelemetryLog" ADD COLUMN IF NOT EXISTS "inverterTemperature" DOUBLE PRECISION;
ALTER TABLE "TelemetryLog" ADD COLUMN IF NOT EXISTS "loadPercent" DOUBLE PRECISION;
ALTER TABLE "TelemetryLog" ADD COLUMN IF NOT EXISTS "operatingMode" TEXT;
ALTER TABLE "TelemetryLog" ADD COLUMN IF NOT EXISTS "outputPriority" TEXT;
ALTER TABLE "TelemetryLog" ADD COLUMN IF NOT EXISTS "chargerPriority" TEXT;
