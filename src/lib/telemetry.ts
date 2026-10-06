import { z } from "zod";
import type { EnergySnapshot } from "@/lib/energy";

const MAX_FUTURE_CLOCK_SKEW_MS = 30_000;

export const telemetryInputSchema = z.object({
  timestamp: z.string().datetime().refine(
    (timestamp) => Date.parse(timestamp) <= Date.now() + MAX_FUTURE_CLOCK_SKEW_MS,
    "timestamp_too_far_in_future",
  ).optional(),
  pv_power: z.number().finite().min(0),
  load_power: z.number().finite().min(0),
  battery_soc: z.number().finite().min(0).max(100),
  battery_power: z.number().finite(),
  battery_voltage: z.number().finite().nonnegative().optional(),
  battery_current: z.number().finite().optional(),
  battery_temperature: z.number().finite().optional(),
  grid_status: z.boolean().nullable().optional(),
  grid_power: z.number().finite().optional(),
  grid_voltage: z.number().finite().nonnegative().optional(),
  inverter_temperature: z.number().finite().optional(),
  load_percent: z.number().finite().min(0).max(300).optional(),
  operating_mode: z.string().trim().max(64).optional(),
  output_priority: z.string().trim().max(64).optional(),
  charger_priority: z.string().trim().max(96).optional(),
  source: z.string().min(1).max(64).default("inverter"),
});

export type TelemetryInput = z.infer<typeof telemetryInputSchema>;

export function telemetryToSnapshot(input: TelemetryInput): EnergySnapshot {
  return {
    timestamp: input.timestamp ?? new Date().toISOString(),
    solarPowerW: input.pv_power,
    homePowerW: input.load_power,
    gridPowerW: input.grid_power ?? 0,
    batteryPowerW: input.battery_power,
    batterySoc: input.battery_soc,
    batteryVoltage: input.battery_voltage,
    batteryCurrent: input.battery_current,
    batteryTemperature: input.battery_temperature,
    gridConnected: input.grid_status ?? null,
    source: "live",
  };
}
