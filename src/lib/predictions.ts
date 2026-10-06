export type NightEndurance = {
  enough: boolean;
  probability: number;
  projectedSocAtSunrise: number;
  usableBatteryKWh: number;
  expectedNightLoadKWh: number;
  remainingNightHours: number;
};

export type SurplusWindow = {
  start: string;
  end: string;
  surplusKWh: number;
};

export function assessNightEndurance(args: {
  batterySoc: number;
  batteryCapacityKWh: number;
  averageNightLoadKW: number;
  remainingNightHours: number;
  reserveSoc?: number;
  dischargeEfficiency?: number;
}): NightEndurance {
  const reserveSoc = Math.min(100, Math.max(0, args.reserveSoc ?? 20));
  const efficiency = Math.min(1, Math.max(0.5, args.dischargeEfficiency ?? 0.92));
  const usableSoc = Math.max(0, args.batterySoc - reserveSoc);
  const usableBatteryKWh = args.batteryCapacityKWh * (usableSoc / 100) * efficiency;
  const expectedNightLoadKWh = Math.max(0, args.averageNightLoadKW) * Math.max(0, args.remainingNightHours);
  const probability = expectedNightLoadKWh <= 0
    ? 100
    : Math.min(100, Math.round((usableBatteryKWh / expectedNightLoadKWh) * 100));
  const projectedSocAtSunrise = Math.max(
    reserveSoc,
    Math.min(
      100,
      args.batterySoc - (expectedNightLoadKWh / Math.max(args.batteryCapacityKWh * efficiency, 0.001)) * 100,
    ),
  );

  return {
    enough: usableBatteryKWh >= expectedNightLoadKWh,
    probability,
    projectedSocAtSunrise: Math.round(projectedSocAtSunrise),
    usableBatteryKWh,
    expectedNightLoadKWh,
    remainingNightHours: Math.max(0, args.remainingNightHours),
  };
}

export function findSurplusWindows(
  hourly: Array<{ time: string; solarKWh: number; loadKWh: number }>,
  batteryCapacityKWh: number,
  batterySoc: number,
  reserveSoc = 100,
): SurplusWindow[] {
  const batteryHeadroom = Math.max(0, batteryCapacityKWh * ((reserveSoc - batterySoc) / 100));
  const windows: SurplusWindow[] = [];
  let current: SurplusWindow | null = null;

  for (const point of hourly) {
    const surplus = Math.max(0, point.solarKWh - point.loadKWh);
    const chargeable = Math.min(surplus, batteryHeadroom);
    const exportable = Math.max(0, surplus - chargeable);

    if (exportable > 0.05) {
      if (!current) {
        current = { start: point.time, end: point.time, surplusKWh: exportable };
      } else {
        current.end = point.time;
        current.surplusKWh += exportable;
      }
    } else if (current) {
      windows.push(current);
      current = null;
    }
  }

  if (current) windows.push(current);
  return windows;
}
