export type BatteryState = "charging" | "discharging" | "idle";
export type EnergySnapshot = {
  timestamp: string;
  solarPowerW: number;
  homePowerW: number;
  gridPowerW: number;
  batteryPowerW: number;
  batterySoc: number;
  batteryVoltage?: number;
  batteryCurrent?: number;
  batteryTemperature?: number;
  gridConnected?: boolean | null;
  gridVoltage?: number;
  inverterTemperature?: number;
  loadPercent?: number;
  operatingMode?: string;
  outputPriority?: string;
  chargerPriority?: string;
  source: "live" | "demo";
  todayProductionKWh?: number;
  todayHomeUsageKWh?: number;
  todayGridSavings?: number;
  /** True when the latest stored reading is older than the live window. */
  stale?: boolean;
  /** Currency code from the settings, for money figures. */
  currency?: string;
};

export function batteryState(w: number): BatteryState {
  return w > 50 ? "charging" : w < -50 ? "discharging" : "idle";
}

export function batteryStateLabel(state: BatteryState) {
  return state === "charging" ? "تشحن" : state === "discharging" ? "تفرغ" : "ثابتة";
}

export function gridLabel(w: number, connected: boolean | null | undefined) {
  if (connected == null) return "حالة الشبكة غير معروفة";
  if (!connected) return "الشبكة مفصولة";
  return w > 50 ? "سحب من الشبكة" : w < -50 ? "تصدير إلى الشبكة" : "غير مستخدمة الآن";
}

export function energyBalance(s: EnergySnapshot) {
  const solar = s.solarPowerW / 1000;
  const gridImport = Math.max(s.gridPowerW, 0) / 1000;
  const gridExport = Math.max(-s.gridPowerW, 0) / 1000;
  const batteryCharge = Math.max(s.batteryPowerW, 0) / 1000;
  const batteryDischarge = Math.max(-s.batteryPowerW, 0) / 1000;
  const load = s.homePowerW / 1000;
  return { solar, gridImport, gridExport, batteryCharge, batteryDischarge, load, residual: solar + gridImport + batteryDischarge - load - batteryCharge - gridExport };
}

export function kwhFromPower(powerW: number, hours: number) {
  return Math.max(0, powerW) / 1000 * Math.max(0, hours);
}


export type SemanticTone = "neutral" | "green" | "cyan" | "blue" | "amber" | "orange" | "red";

export function batteryTone(soc: number): SemanticTone {
  if (!Number.isFinite(soc)) return "neutral";
  if (soc >= 70) return "green";
  if (soc >= 35) return "amber";
  if (soc >= 15) return "amber";
  return "red";
}

export function solarTone(powerKw: number, panelCapacityKw?: number): SemanticTone {
  if (!Number.isFinite(powerKw) || powerKw <= 0) return "neutral";
  if (panelCapacityKw && panelCapacityKw > 0) {
    const ratio = powerKw / panelCapacityKw;
    if (ratio >= 0.7) return "green";
    if (ratio >= 0.25) return "cyan";
    return "blue";
  }
  if (powerKw >= 4) return "green";
  if (powerKw >= 1) return "cyan";
  return "blue";
}

export function loadTone(powerKw: number): SemanticTone {
  if (!Number.isFinite(powerKw) || powerKw <= 0) return "neutral";
  if (powerKw >= 5) return "red";
  if (powerKw >= 2) return "amber";
  return "blue";
}

export function surplusTone(surplusKw: number): SemanticTone {
  if (!Number.isFinite(surplusKw) || Math.abs(surplusKw) < 0.05) return "neutral";
  return surplusKw > 0 ? "green" : "orange";
}

export function moneyTone(amount: number): SemanticTone {
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.0001) return "neutral";
  return amount > 0 ? "green" : "red";
}

export const semanticText: Record<SemanticTone, string> = {
  neutral: "text-slate-500", green: "text-emerald-600", cyan: "text-cyan-600",
  blue: "text-blue-600", amber: "text-amber-600", orange: "text-amber-600", red: "text-red-600",
};

export const semanticIcon: Record<SemanticTone, string> = {
  neutral: "text-slate-400", green: "text-emerald-500", cyan: "text-cyan-500",
  blue: "text-blue-500", amber: "text-amber-500", orange: "text-amber-500", red: "text-red-500",
};

export const semanticBg: Record<SemanticTone, string> = {
  neutral: "bg-slate-100", green: "bg-emerald-50", cyan: "bg-cyan-50", blue: "bg-blue-50",
  amber: "bg-amber-50", orange: "bg-amber-50", red: "bg-red-50",
};

export const semanticBorder: Record<SemanticTone, string> = {
  neutral: "border-slate-200", green: "border-emerald-200", cyan: "border-cyan-200", blue: "border-blue-200",
  amber: "border-amber-200", orange: "border-amber-200", red: "border-red-200",
};

/** Arabic wording for the inverter's own status texts; unknown texts pass through. */
export function inverterModeLabel(mode?: string) {
  if (!mode) return "—";
  if (/off.?grid|battery|inverter/i.test(mode)) return "من الشمس والبطارية (بدون الشبكة)";
  if (/mains|line|grid|utility|bypass/i.test(mode)) return "من الشبكة (Mains)";
  if (/standby/i.test(mode)) return "استعداد";
  if (/fault/i.test(mode)) return "عطل";
  return mode;
}

export function outputPriorityLabel(value?: string) {
  if (!value) return "—";
  if (/sbu/i.test(value)) return "شمس ← بطارية ← شبكة (SBU)";
  if (/sub|solar/i.test(value)) return "شمس ← شبكة ← بطارية (SUB)";
  if (/uti|utility/i.test(value)) return "الشبكة أولاً";
  return value;
}

export function chargerPriorityLabel(value?: string) {
  if (!value) return "—";
  if (/only\s*pv/i.test(value)) return "من الشمس فقط";
  if (/pv.*(and|&|\+).*(utility|grid)|solar.*utility|snu/i.test(value)) return "من الشمس والشبكة";
  if (/utility|grid/i.test(value)) return "من الشبكة";
  return value;
}

/*
 * Identity colours: every source keeps one colour everywhere in the app, so a
 * number's colour already says what it is. Warning colours only appear when
 * something needs attention (low battery, heavy load).
 *   solar = amber · battery = emerald · home = sky · grid = violet
 */
export function solarText(kw: number) {
  return kw > 0.05 ? "text-amber-600" : "text-slate-500";
}
export function homeText(kw: number) {
  if (kw >= 5) return "text-rose-600";
  if (kw >= 2) return "text-amber-700";
  return "text-sky-700";
}
export function batteryText(soc: number) {
  if (!Number.isFinite(soc)) return "text-slate-500";
  if (soc < 15) return "text-rose-600";
  if (soc < 30) return "text-amber-600";
  return "text-emerald-600";
}

/** Arabic duration with correct plural forms: "3 ساعات و5 دقائق". */
export function arabicDuration(totalMinutes: number) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const unit = (n: number, one: string, two: string, few: string, many: string) =>
    n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  const hours = h ? unit(h, "ساعة", "ساعتان", "ساعات", "ساعة") : "";
  const mins = r ? unit(r, "دقيقة", "دقيقتان", "دقائق", "دقيقة") : "";
  if (hours && mins) return `${hours} و${mins}`;
  return hours || mins || "أقل من دقيقة";
}


/** Nominal AC voltage used to express house/grid power as amps (Lebanon: 230 V). */
export const AC_VOLTS = 230;

/** AC current for a power on the 230 V side (house, grid, or a share of the house load). */
export function acAmps(watts: number | null | undefined): number | null {
  if (typeof watts !== "number" || !Number.isFinite(watts)) return null;
  return Math.abs(watts) / AC_VOLTS;
}

/**
 * Battery current: the measured value when the inverter reports it, else
 * power ÷ battery voltage. A measured 0 A while the battery clearly moves power
 * is a stale one-way parameter, not a measurement, so the derived value wins.
 * Without a measured voltage the bank's working voltage (from its nominal
 * class in Settings) is used instead of always assuming a 48 V bank.
 */
export function batteryAmps(snapshot: { batteryCurrent?: number; batteryVoltage?: number; batteryPowerW: number } | null | undefined, nominal?: number | null): number | null {
  if (!snapshot) return null;
  const powerKnown = Number.isFinite(snapshot.batteryPowerW);
  const measured = typeof snapshot.batteryCurrent === "number" && Number.isFinite(snapshot.batteryCurrent) ? Math.abs(snapshot.batteryCurrent) : null;
  if (measured !== null && !(measured < 0.5 && powerKnown && Math.abs(snapshot.batteryPowerW) > 50)) return measured;
  const volts = snapshot.batteryVoltage && snapshot.batteryVoltage > 10 ? snapshot.batteryVoltage : batteryWorkingVolts(nominal);
  return powerKnown ? Math.abs(snapshot.batteryPowerW) / volts : measured;
}

/** Energy on the 230 V side expressed as amp-hours (kWh × 1000 ÷ 230). */
export function acAmpHours(kWh: number | null | undefined): number | null {
  if (typeof kWh !== "number" || !Number.isFinite(kWh)) return null;
  return (Math.abs(kWh) * 1000) / AC_VOLTS;
}

/** Real working voltage of a battery bank from its nominal class (LiFePO4: 3.2 V per cell). */
export function batteryWorkingVolts(nominal?: number | null): number {
  if (nominal === 48) return 51.2;
  if (nominal === 24) return 25.6;
  if (nominal === 12) return 12.8;
  return nominal && nominal > 0 ? nominal : 51.2;
}

/** Battery energy expressed as amp-hours at the battery's own voltage. */
export function batteryAmpHours(kWh: number | null | undefined, nominal?: number | null): number | null {
  if (typeof kWh !== "number" || !Number.isFinite(kWh)) return null;
  return (Math.abs(kWh) * 1000) / batteryWorkingVolts(nominal);
}

/**
 * Whole percentages of a split that always add up to 100 (largest remainder):
 * rounding each part on its own gave 33 + 33 + 33 = 99 or 101.
 */
export function percentsOf(values: number[]): number[] {
  const parts = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = parts.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, v) => sum + v, 0);
  const order = exact.map((v, i) => ({ i, r: v - floors[i] })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}
