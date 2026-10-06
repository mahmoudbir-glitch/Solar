export type HourlyForecast = {
  time: string;
  solarKwh: number;
  expectedLoadKwh: number;
  batteryChargeKwh: number;
  surplusKwh: number;
};

export function estimateSolarProduction(
  radiationWm2: number,
  panelKw: number,
  performanceRatio = 0.82,
) {
  return Math.max(0, (radiationWm2 / 1000) * panelKw * performanceRatio);
}

export function buildHourlyForecast(
  times: string[],
  radiation: number[],
  panelKw: number,
  batterySoc: number,
  batteryCapacityKwh: number,
): HourlyForecast[] {
  return times.map((time, i) => {
    const solarKwh = estimateSolarProduction(radiation[i] ?? 0, panelKw) ;
    const hour = new Date(time).getHours();
    const expectedLoadKwh = hour >= 18 || hour < 7 ? 0.75 : 1.15;
    const batteryChargeKwh = Math.max(0, Math.min(solarKwh * 0.35, batteryCapacityKwh * 0.25));
    const surplusKwh = Math.max(0, solarKwh - expectedLoadKwh - batteryChargeKwh);
    return { time, solarKwh, expectedLoadKwh, batteryChargeKwh, surplusKwh };
  });
}

export function batteryNightAssessment(
  soc: number,
  capacityKwh: number,
  nightLoadKwh: number,
  reserve = 0.2,
) {
  const usable = Math.max(0, capacityKwh * Math.max(0, soc / 100 - reserve));
  const probability = nightLoadKwh <= 0 ? 100 : Math.min(100, Math.round((usable / nightLoadKwh) * 100));
  return { usableKwh: usable, probability, enough: usable >= nightLoadKwh };
}
