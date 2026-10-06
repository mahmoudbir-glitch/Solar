/**
 * Electrical limits taken from inverter nameplates.
 *
 * Every number here is transcribed from the rating label physically attached to
 * the unit — not inferred, not typical-for-the-class. A profile is only added
 * once its label (or the manufacturer manual) has been read, because a settings
 * form that accepts a voltage the hardware cannot honour will silently let
 * someone configure a cut-off the inverter ignores.
 *
 * These are electrical limits only. They say nothing about how to *read* the
 * inverter: that needs a Modbus register map, which lives in gateway/gateway.py
 * and is a separate, per-model piece of documentation.
 */
export type InverterLimits = {
  /** Model name exactly as printed on the label. */
  model: string;
  manufacturer: string;
  ratedPowerKw: number;
  battery: {
    /** Usable DC input window of the inverter itself, in volts. */
    minVoltage: number;
    maxVoltage: number;
    /** Highest continuous battery current the inverter will pass, in amps. */
    maxCurrentA: number;
  };
  charging: {
    maxSolarCurrentA: number;
    maxAcCurrentA: number;
  };
  /** Factory thresholds for dropping and restoring the main load, in volts. */
  loadTransfer: {
    cutOffVoltage: number;
    returnVoltage: number;
  };
  pv: {
    maxVoltage: number;
    minOperatingVoltage: number;
    maxOperatingVoltage: number;
    maxCurrentA: number;
  };
  ac: {
    maxInputCurrentA: number;
    maxMainLoadW: number;
    maxSecondLoadW: number;
  };
};

const PROFILES: InverterLimits[] = [
  {
    // Label: "INVERTER CHARGER / MODEL NAME: Victor Max-8.2KW /
    // MODEL NUMBER: Max-8.2KW-M", barcode 92085230517098.
    model: "Victor Max-8.2KW",
    manufacturer: "Next Power",
    ratedPowerKw: 8.2,
    battery: { minVoltage: 40, maxVoltage: 63, maxCurrentA: 190 },
    charging: { maxSolarCurrentA: 160, maxAcCurrentA: 140 },
    loadTransfer: { cutOffVoltage: 44, returnVoltage: 52 },
    pv: { maxVoltage: 500, minOperatingVoltage: 90, maxOperatingVoltage: 450, maxCurrentA: 27 },
    ac: { maxInputCurrentA: 40, maxMainLoadW: 8200, maxSecondLoadW: 2733 },
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Looks up nameplate limits for a model string as stored on the connection.
 * Returns null for any model whose label has not been transcribed, in which
 * case only the generic schema bounds apply — better than guessing.
 */
export function getInverterLimits(model: string | null | undefined): InverterLimits | null {
  if (!model) return null;
  const needle = normalize(model);
  return (
    PROFILES.find((profile) => {
      const known = normalize(profile.model);
      return needle === known || needle.includes(known) || known.includes(needle);
    }) ?? null
  );
}

export type LimitViolation = { error: string; message: string };

/**
 * Checks the settings a user is about to save against what the inverter can
 * actually do. Only fields present in `values` are checked, and every message
 * names the limit and where it comes from so the number can be verified against
 * the label rather than taken on trust.
 */
export function checkAgainstInverter(
  limits: InverterLimits,
  values: {
    lowDcCutoffVoltage?: number | null;
    backToGridVoltage?: number | null;
    bulkChargeVoltage?: number | null;
    floatChargeVoltage?: number | null;
    maxChargeCurrentA?: number | null;
    batteryMaxChargeA?: number | null;
    batteryMaxDischargeA?: number | null;
    inverterRatedPowerKw?: number | null;
  },
): LimitViolation | null {
  const { minVoltage, maxVoltage, maxCurrentA } = limits.battery;
  const label = `${limits.manufacturer} ${limits.model}`;

  const voltages: Array<[keyof typeof values, string]> = [
    ["lowDcCutoffVoltage", "جهد فصل الحمل"],
    ["backToGridVoltage", "جهد عودة الحمل"],
    ["bulkChargeVoltage", "جهد الشحن Bulk"],
    ["floatChargeVoltage", "جهد الشحن Float"],
  ];

  for (const [key, arabicName] of voltages) {
    const value = values[key];
    if (value == null) continue;
    if (value < minVoltage || value > maxVoltage) {
      return {
        error: "voltage_outside_inverter_range",
        message: `${arabicName} (${value}V) خارج نطاق بطارية ${label}، وهو ${minVoltage}–${maxVoltage}V بحسب لوحة المواصفات.`,
      };
    }
  }

  const currents: Array<[keyof typeof values, string]> = [
    ["maxChargeCurrentA", "أقصى تيار شحن"],
    ["batteryMaxChargeA", "أقصى تيار شحن للبطارية"],
    ["batteryMaxDischargeA", "أقصى تيار تفريغ للبطارية"],
  ];

  for (const [key, arabicName] of currents) {
    const value = values[key];
    if (value == null) continue;
    if (value > maxCurrentA) {
      return {
        error: "current_above_inverter_limit",
        message: `${arabicName} (${value}A) يتجاوز أقصى تيار بطارية لـ ${label}، وهو ${maxCurrentA}A.`,
      };
    }
  }

  if (values.maxChargeCurrentA != null && values.maxChargeCurrentA > limits.charging.maxSolarCurrentA) {
    return {
      error: "solar_current_above_inverter_limit",
      message: `أقصى تيار شحن (${values.maxChargeCurrentA}A) يتجاوز أقصى تيار شحن شمسي لـ ${label}، وهو ${limits.charging.maxSolarCurrentA}A.`,
    };
  }

  if (values.inverterRatedPowerKw != null && values.inverterRatedPowerKw > limits.ratedPowerKw) {
    return {
      error: "rated_power_above_inverter",
      message: `القدرة المقدّرة (${values.inverterRatedPowerKw}kW) تتجاوز قدرة ${label} المقدّرة، وهي ${limits.ratedPowerKw}kW.`,
    };
  }

  return null;
}
