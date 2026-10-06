/**
 * Pure solar helpers with no imports, so tests can load this file directly.
 */

const RAD = Math.PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;

/**
 * Sunrise and sunset for the solar day nearest `instant` (the standard
 * SunCalc/NOAA approximation, good to a minute or two). Times are real instants.
 */
export function sunTimes(instant: Date, latitude: number, longitude: number): { sunrise: Date; sunset: Date } {
  const toJulian = (date: Date) => date.valueOf() / 86_400_000 - 0.5 + J1970;
  const fromJulian = (julian: number) => new Date((julian + 0.5 - J1970) * 86_400_000);
  const d = toJulian(instant) - J2000;
  const lw = RAD * -longitude;
  const phi = RAD * latitude;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(RAD * 23.4397) * Math.sin(L));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const h0 = RAD * -0.833;
  const w = Math.acos((Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
  const set = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { sunrise: fromJulian(noon - (set - noon)), sunset: fromJulian(set) };
}

/** One local clock hour of stored readings ("2026-10-02T11:00"). */
export type HourReadings = { hour: string; pvW: number; socMax: number; batteryW: number; samples: number };

export type Calibration = {
  /** Multiplier for the weather-based estimate; 1 unless status is "calibrated". */
  factor: number;
  /** Measured / expected before any guard, for display and diagnosis. */
  ratio: number;
  /**
   * learning: not enough clean hours yet. suspect: the panels look far weaker
   * than any healthy array, which on an off-grid system almost always means the
   * readings were throttled or the panel size in Settings is wrong, so the
   * factor is not applied.
   */
  status: "calibrated" | "learning" | "suspect";
  hours: number;
  days: number;
  measuredKWh: number;
  expectedKWh: number;
};

export const CALIBRATION_MIN_HOURS = 8;
/** Enough days that one stormy day cannot drag the factor down on its own. */
export const CALIBRATION_MIN_DAYS = 5;
/** Below this the result is reported but not applied (see "suspect"). */
export const CALIBRATION_PLAUSIBLE_MIN = 0.65;
/** LiFePO4 starts tapering its charge current around here, throttling the panels. */
const TAPER_SOC = 90;

/**
 * How the panels really perform compared with the weather estimate.
 *
 * Only hours where the panels could deliver everything they had count: an
 * off-grid inverter throttles the panels once the battery is full, and again
 * when the battery is already taking its maximum charge current, so those
 * hours would make good panels look weak.
 */
export function calibrationFactor(readings: HourReadings[], expectedKWhByHour: Map<string, number>, currentHour: string): Calibration {
  const candidates = readings.filter((row) => {
    const expected = expectedKWhByHour.get(row.hour) ?? 0;
    // Zero from the panels in good light is a missing reading or a mode where
    // the inverter reports no PV, not a measurement of the panels.
    const noReading = row.pvW < 50 && expected >= 0.5;
    return row.hour < currentHour && row.samples >= 6 && expected >= 0.3 && !noReading;
  });
  const peakChargeW = Math.max(0, ...candidates.map((row) => row.batteryW));
  const chargeCapW = peakChargeW > 300 ? peakChargeW * 0.9 : Infinity;
  const usable = candidates.filter((row) => row.socMax < TAPER_SOC && row.batteryW < chargeCapW);

  const measuredKWh = usable.reduce((sum, row) => sum + Math.max(0, row.pvW) / 1000, 0);
  const expectedKWh = usable.reduce((sum, row) => sum + (expectedKWhByHour.get(row.hour) ?? 0), 0);
  const days = new Set(usable.map((row) => row.hour.slice(0, 10))).size;
  const round = (value: number) => Math.round(value * 10) / 10;

  const ratio = expectedKWh > 0 ? Math.round((measuredKWh / expectedKWh) * 100) / 100 : 0;
  const base = { ratio, hours: usable.length, days, measuredKWh: round(measuredKWh), expectedKWh: round(expectedKWh) };
  if (usable.length < CALIBRATION_MIN_HOURS || days < CALIBRATION_MIN_DAYS || expectedKWh <= 0) {
    return { ...base, factor: 1, status: "learning" };
  }
  if (ratio < CALIBRATION_PLAUSIBLE_MIN) return { ...base, factor: 1, status: "suspect" };
  return { ...base, factor: Math.min(1.3, ratio), status: "calibrated" };
}
