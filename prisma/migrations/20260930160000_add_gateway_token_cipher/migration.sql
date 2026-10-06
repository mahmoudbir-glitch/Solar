-- Shamsak can only authenticate to the local gateway if it can still read the token it
-- issued. The sha256 hash is one-way, so a second, reversible copy is stored encrypted
-- with INVERTER_CONFIG_SECRET (AES-256-GCM, same helper as wifiPasswordCipher).
-- Additive and re-runnable: safe on a database that already has the column.
ALTER TABLE "InverterConnection" ADD COLUMN IF NOT EXISTS "gatewayTokenCipher" TEXT;
