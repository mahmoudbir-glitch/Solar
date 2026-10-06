import type { EnergySnapshot } from "@/lib/energy";

export type BatteryNightPrediction = {
  usableKWh: number;
  expectedNightLoadKWh: number;
  endSocPct: number;
  probabilityPct: number;
  enough: boolean;
  hoursToEmpty: number | null;
};

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function estimateBatteryNight(
  snapshot: Pick<EnergySnapshot, "batterySoc" | "batteryVoltage">,
  batteryCapacityKWh: number,
  expectedNightLoadKWh: number,
  reserveSocPct = 20,
): BatteryNightPrediction {
  const capacity = Math.max(0.1, batteryCapacityKWh);
  const soc = clamp(snapshot.batterySoc, 0, 100);
  const reserve = clamp(reserveSocPct, 0, 95);
  const usableKWh = Math.max(0, capacity * Math.max(0, soc - reserve) / 100);
  const load = Math.max(0.01, expectedNightLoadKWh);
  const requiredPct = (load / capacity) * 100;
  const endSocPct = clamp(soc - requiredPct, 0, 100);
  const ratio = usableKWh / load;
  const probabilityPct = Math.round(clamp(ratio * 100, 0, 100));
  const enough = usableKWh >= load;
  return {
    usableKWh,
    expectedNightLoadKWh: load,
    endSocPct,
    probabilityPct,
    enough,
    hoursToEmpty: load > 0 ? usableKWh / (load / 8) : null,
  };
}

export function solarSurplus(
  solarPowerW: number,
  homePowerW: number,
  batteryPowerW: number,
) {
  const solar = Math.max(0, solarPowerW) / 1000;
  const load = Math.max(0, homePowerW) / 1000;
  const batteryCharge = Math.max(0, batteryPowerW) / 1000;
  return Math.max(0, solar - load - batteryCharge);
}

export function powerSourceShares(snapshot: EnergySnapshot) {
  const solar = Math.max(0, snapshot.solarPowerW);
  const battery = Math.max(0, -snapshot.batteryPowerW);
  const grid = snapshot.gridConnected === false ? 0 : Math.max(0, snapshot.gridPowerW);
  const total = solar + battery + grid;
  if (total <= 0) return { solarPct: 0, batteryPct: 0, gridPct: 0 };
  return {
    solarPct: Math.round((solar / total) * 100),
    batteryPct: Math.round((battery / total) * 100),
    gridPct: Math.round((grid / total) * 100),
  };
}

export function notificationMessages(snapshot: EnergySnapshot, batteryMinSoc = 20) {
  const messages: string[] = [];
  if (snapshot.batterySoc >= 99 && snapshot.solarPowerW > snapshot.homePowerW) {
    messages.push("البطارية ممتلئة تقريبًا — استغل الفائض الشمسي.");
  }
  if (snapshot.homePowerW > snapshot.solarPowerW + Math.max(0, -snapshot.batteryPowerW) && snapshot.batterySoc <= batteryMinSoc) {
    messages.push("⚠️ استهلاك مرتفع والبطارية منخفضة.");
  }
  if (snapshot.gridConnected === false) messages.push("الشبكة مفصولة.");
  return messages;
}
