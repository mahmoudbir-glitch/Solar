/**
 * Self-check for the values the dashboard shows.
 *
 * Runs on the reading the connection test has just fetched and answers, in
 * plain Arabic, whether each number is sane, whether the kW / amp figures are
 * derived the way the app says they are, and whether the icons and the
 * drop-down detail cards would be drawn consistently from those numbers.
 *
 * Pure on purpose: no imports, so tests can load this file directly. The few
 * constants shared with energy.ts are asserted equal by a test.
 */

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckGroup = "inputs" | "kw" | "amps" | "calc" | "ui";
export type CheckItem = { id: string; group: CheckGroup; status: CheckStatus; label: string; detail: string };
export type CheckReport = { ok: boolean; counts: Record<CheckStatus, number>; items: CheckItem[] };

export type CheckReading = {
  solarPowerW?: number;
  loadPowerW?: number;
  batterySoc?: number;
  batteryPowerW?: number;
  batteryVoltage?: number;
  batteryCurrent?: number;
  batteryTemperature?: number;
  gridVoltage?: number;
  gridPowerW?: number;
  gridConnected?: boolean;
  inverterTemperature?: number;
  loadPercent?: number;
  operatingMode?: string;
};

export type CheckSettings = {
  panelPowerW?: number | null;
  batteryCapacityWh?: number | null;
  batteryNominalVoltage?: number | null;
  inverterRatedPowerKw?: number | null;
};

export type CheckLimits = {
  ratedPowerKw: number;
  battery: { minVoltage: number; maxVoltage: number; maxCurrentA: number };
  ac: { maxInputCurrentA: number };
};

export type CheckInput = { reading: CheckReading; settings?: CheckSettings | null; limits?: CheckLimits | null };

/** Same nominal mains voltage energy.ts uses to express AC power as amps. */
export const CHECK_AC_VOLTS = 230;
/** Power below this is "no flow" in the energy-flow drawing (0.05 kW). */
const FLOW_W = 50;

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const fmt = (value: number, digits = 1) => (Math.round(value * 10 ** digits) / 10 ** digits).toLocaleString("en-US", { maximumFractionDigits: digits });
const workingVolts = (nominal?: number | null) => (nominal === 48 ? 51.2 : nominal === 24 ? 25.6 : nominal === 12 ? 12.8 : nominal && nominal > 0 ? nominal : 51.2);

export function runSystemCheck({ reading, settings, limits }: CheckInput): CheckReport {
  const items: CheckItem[] = [];
  const add = (group: CheckGroup, id: string, status: CheckStatus, label: string, detail: string) => items.push({ id, group, status, label, detail });

  const panelW = isNum(settings?.panelPowerW) && settings!.panelPowerW! > 0 ? settings!.panelPowerW! : null;
  const ratedKw = isNum(settings?.inverterRatedPowerKw) && settings!.inverterRatedPowerKw! > 0 ? settings!.inverterRatedPowerKw! : limits?.ratedPowerKw ?? null;
  const nominal = settings?.batteryNominalVoltage ?? null;
  const { solarPowerW: pv, loadPowerW: load, batterySoc: soc, batteryPowerW: batW, batteryVoltage: batV, batteryCurrent: batI } = reading;

  // ───────────── القيم الداخلة (ما وصل من الإنفرتر) ─────────────
  const required: Array<[string, unknown]> = [
    ["الألواح", pv], ["الحمل", load], ["نسبة البطارية", soc], ["قدرة البطارية", batW], ["حالة الشبكة", reading.gridConnected],
  ];
  const missing = required.filter(([, value]) => value === undefined || value === null || (typeof value === "number" && !Number.isFinite(value))).map(([name]) => name);
  add("inputs", "required", missing.length ? "fail" : "pass", "القيم الأساسية الخمس", missing.length ? `ناقصة: ${missing.join("، ")}` : "الألواح والحمل والبطارية والشبكة وصلت كلها.");

  if (isNum(pv)) {
    if (pv < 0) add("inputs", "pv", "fail", "قدرة الألواح", `قيمة سالبة (${fmt(pv, 0)} W) غير ممكنة.`);
    else if (panelW && pv > panelW * 1.5) add("inputs", "pv", "fail", "قدرة الألواح", `${fmt(pv, 0)} W أكبر بكثير من سعة الألواح (${fmt(panelW, 0)} W): غالباً خطأ وحدة أو سعة خاطئة في الإعدادات.`);
    else if (panelW && pv > panelW * 1.15) add("inputs", "pv", "warn", "قدرة الألواح", `${fmt(pv, 0)} W أعلى من سعة الألواح المسجلة (${fmt(panelW, 0)} W). قد تكون سعة الألواح في الإعدادات أقل من الحقيقية.`);
    else add("inputs", "pv", "pass", "قدرة الألواح", panelW ? `${fmt(pv, 0)} W (${fmt((pv / panelW) * 100, 0)}% من سعة الألواح).` : `${fmt(pv, 0)} W.`);
  }

  if (isNum(load)) {
    const limitW = ratedKw ? ratedKw * 1000 : null;
    if (load < 0) add("inputs", "load", "fail", "حمل المنزل", `قيمة سالبة (${fmt(load, 0)} W) غير ممكنة.`);
    else if (limitW && load > limitW * 2) add("inputs", "load", "fail", "حمل المنزل", `${fmt(load, 0)} W ضعف قدرة الإنفرتر (${fmt(limitW, 0)} W) على الأقل: قراءة غير معقولة.`);
    else if (limitW && load > limitW * 1.1) add("inputs", "load", "warn", "حمل المنزل", `${fmt(load, 0)} W يتجاوز قدرة الإنفرتر الاسمية (${fmt(limitW, 0)} W).`);
    else add("inputs", "load", "pass", "حمل المنزل", limitW ? `${fmt(load, 0)} W (${fmt((load / limitW) * 100, 0)}% من قدرة الإنفرتر).` : `${fmt(load, 0)} W.`);
  }

  if (isNum(soc)) {
    add("inputs", "soc", soc < 0 || soc > 100 ? "fail" : "pass", "نسبة البطارية", soc < 0 || soc > 100 ? `${fmt(soc, 0)}% خارج المدى 0–100.` : `${fmt(soc, 0)}%.`);
  }

  if (isNum(batV)) {
    const lo = limits ? limits.battery.minVoltage : nominal ? workingVolts(nominal) * 0.75 : null;
    const hi = limits ? limits.battery.maxVoltage : nominal ? workingVolts(nominal) * 1.3 : null;
    if (batV <= 0) add("inputs", "batV", "warn", "جهد البطارية", "0 V: لم يرسل الإنفرتر الجهد، وسيُفترض جهد اسمي في حساب الأمبير.");
    else if (lo !== null && hi !== null && (batV < lo || batV > hi)) add("inputs", "batV", "fail", "جهد البطارية", `${fmt(batV)} V خارج المدى ${fmt(lo, 0)}–${fmt(hi, 0)} V${limits ? " (لوحة مواصفات الإنفرتر)" : " (من الجهد الاسمي في الإعدادات)"}.`);
    else add("inputs", "batV", "pass", "جهد البطارية", `${fmt(batV)} V${lo !== null && hi !== null ? ` ضمن ${fmt(lo, 0)}–${fmt(hi, 0)} V` : ""}.`);
    if (nominal && batV > 0) {
      const nearest = [12, 24, 48].reduce((best, value) => (Math.abs(value * 1.067 - batV) < Math.abs(best * 1.067 - batV) ? value : best), 48);
      if (nearest !== nominal) add("inputs", "nominal", "fail", "الجهد الاسمي في الإعدادات", `الجهد المقروء ${fmt(batV)} V يخص بطارية ${nearest}V لكن الإعدادات تقول ${nominal}V؛ ستخرج أمبيرات الساعة خاطئة.`);
    }
  }

  if (isNum(batI) && limits) {
    add("inputs", "batI", Math.abs(batI) > limits.battery.maxCurrentA ? "fail" : "pass", "تيار البطارية", Math.abs(batI) > limits.battery.maxCurrentA ? `${fmt(Math.abs(batI))} A يتجاوز حد الإنفرتر ${limits.battery.maxCurrentA} A.` : `${fmt(batI)} A (الحد ${limits.battery.maxCurrentA} A).`);
  }

  if (isNum(reading.gridVoltage)) {
    const gv = reading.gridVoltage;
    if (reading.gridConnected === true && gv < 50) add("inputs", "gridV", "fail", "جهد الشبكة", `الشبكة موصولة لكن الجهد ${fmt(gv)} V فقط: تناقض.`);
    else if (reading.gridConnected === false && gv > 50 && !/off.?grid|battery/i.test(reading.operatingMode ?? "")) add("inputs", "gridV", "warn", "جهد الشبكة", `الشبكة مقطوعة لكن الجهد ${fmt(gv)} V؛ تحقق من وضع التشغيل.`);
    else if (gv > 0 && (gv < 180 || gv > 260)) add("inputs", "gridV", "warn", "جهد الشبكة", `${fmt(gv)} V خارج المدى المعتاد 180–260 V.`);
    else add("inputs", "gridV", "pass", "جهد الشبكة", `${fmt(gv)} V.`);
  }

  for (const [key, label, value] of [["tempInv", "حرارة الإنفرتر", reading.inverterTemperature], ["tempBat", "حرارة البطارية", reading.batteryTemperature]] as const) {
    if (isNum(value)) add("inputs", key, value < -10 || value > 100 ? "fail" : value > 75 ? "warn" : "pass", label, value < -10 || value > 100 ? `${fmt(value)}°C غير معقولة.` : `${fmt(value)}°C.`);
  }
  if (isNum(reading.loadPercent)) {
    add("inputs", "loadPct", reading.loadPercent < 0 || reading.loadPercent > 130 ? "fail" : reading.loadPercent > 100 ? "warn" : "pass", "نسبة حمل الإنفرتر", `${fmt(reading.loadPercent, 0)}%.`);
  }

  // ───────────── التحويل إلى kW (ما تعرضه البطاقات) ─────────────
  const powers: Array<[string, number | undefined]> = [["الألواح", pv], ["المنزل", load], ["البطارية", batW], ["الشبكة", reading.gridPowerW]];
  const shown = powers.filter((entry): entry is [string, number] => isNum(entry[1]));
  if (shown.length) {
    const bad = shown.filter(([, w]) => !Number.isFinite(w / 1000) || Math.abs((w / 1000) * 1000 - w) > 0.5);
    add("kw", "kw-convert", bad.length ? "fail" : "pass", "تحويل W إلى kW", bad.length ? `فشل التحويل: ${bad.map(([n]) => n).join("، ")}.` : shown.map(([name, w]) => `${name} ${fmt(Math.abs(w) / 1000, 2)} kW`).join(" • "));
  }
  const nonZero = shown.map(([, w]) => Math.abs(w)).filter((w) => w > 0);
  const biggest = Math.max(0, ...nonZero);
  const tiny = shown.filter(([, w]) => Math.abs(w) > 0 && Math.abs(w) < 15);
  if (biggest > 500 && tiny.length) {
    add("kw", "kw-scale", "warn", "تشابه الوحدات", `القيم ${tiny.map(([n, w]) => `${n}=${fmt(w, 3)}`).join("، ")} صغيرة جداً بجانب ${fmt(biggest, 0)} W: قد تكون بالكيلوواط وقُرئت كواط.`);
  } else if (shown.length) {
    add("kw", "kw-scale", "pass", "تشابه الوحدات", "كل القيم بنفس مقياس الواط.");
  }

  // ───────────── الأمبير (طريقة الحساب) ─────────────
  const acA = (w: number) => Math.abs(w) / CHECK_AC_VOLTS;
  if (isNum(pv) || isNum(load)) {
    add("amps", "ac-amps", "pass", "أمبير جهة 230V", [isNum(pv) ? `الألواح ${fmt(pv, 0)}W ÷ 230V = ${fmt(acA(pv))}A` : "", isNum(load) ? `المنزل ${fmt(load, 0)}W ÷ 230V = ${fmt(acA(load))}A` : ""].filter(Boolean).join(" • "));
  }
  if (isNum(reading.gridPowerW)) {
    const volts = isNum(reading.gridVoltage) && reading.gridVoltage > 50 ? reading.gridVoltage : CHECK_AC_VOLTS;
    add("amps", "grid-amps", "pass", "أمبير الشبكة", `${fmt(Math.abs(reading.gridPowerW), 0)}W ÷ ${fmt(volts, 0)}V = ${fmt(Math.abs(reading.gridPowerW) / volts)}A${volts === CHECK_AC_VOLTS ? " (جهد اسمي)" : " (الجهد المقروء)"}.`);
  }
  if (isNum(batW)) {
    const haveV = isNum(batV) && batV > 20;
    const volts = haveV ? batV! : workingVolts(nominal);
    const derived = Math.abs(batW) / volts;
    if (isNum(batI)) {
      const diff = Math.abs(Math.abs(batI) - derived);
      add("amps", "bat-amps", diff > Math.max(3, derived * 0.2) ? "warn" : "pass", "أمبير البطارية", `المقاس ${fmt(Math.abs(batI))}A مقابل المحسوب ${fmt(derived)}A (${fmt(Math.abs(batW), 0)}W ÷ ${fmt(volts)}V).${diff > Math.max(3, derived * 0.2) ? " الفرق كبير؛ يُعرض المقاس." : ""}`);
    } else {
      add("amps", "bat-amps", haveV ? "pass" : "warn", "أمبير البطارية", `${fmt(Math.abs(batW), 0)}W ÷ ${fmt(volts)}V = ${fmt(derived)}A${haveV ? "" : " — الجهد لم يصل فاستُخدم الجهد الاسمي"}.`);
    }
  }
  if (isNum(settings?.batteryCapacityWh) && settings!.batteryCapacityWh! > 0) {
    const wh = settings!.batteryCapacityWh!;
    const ah = wh / workingVolts(nominal);
    add("amps", "bat-ah", ah < 5 || ah > 2000 ? "warn" : "pass", "سعة البطارية بالأمبير-ساعة", `${fmt(wh / 1000, 2)} kWh ÷ ${fmt(workingVolts(nominal))}V = ${fmt(ah, 0)} Ah.${ah < 5 || ah > 2000 ? " قيمة غير مألوفة؛ راجع سعة البطارية أو الجهد الاسمي." : ""}`);
  }

  // ───────────── الحسابات والتناسق ─────────────
  if (isNum(batW) && isNum(batV) && isNum(batI) && batV > 20) {
    const product = batV * batI;
    const gap = Math.abs(product - batW);
    const opposite = Math.abs(product) > 200 && Math.abs(batW) > 200 && Math.sign(product) !== Math.sign(batW);
    add("calc", "bat-vi", opposite ? "fail" : gap > Math.max(150, Math.abs(batW) * 0.15) ? "warn" : "pass", "قدرة البطارية = V × I",
      opposite ? `الإشارتان متعاكستان: V×I = ${fmt(product, 0)}W لكن القدرة ${fmt(batW, 0)}W (شحن/تفريغ معكوس).` : `${fmt(batV)}V × ${fmt(batI)}A = ${fmt(product, 0)}W مقابل ${fmt(batW, 0)}W.`);
  }

  if (isNum(pv) && isNum(load) && isNum(batW)) {
    const gridKnown = isNum(reading.gridPowerW);
    const grid = gridKnown ? reading.gridPowerW! : 0;
    const sources = Math.max(0, pv) + Math.max(0, grid) + Math.max(0, -batW);
    const sinks = Math.max(0, load) + Math.max(0, batW) + Math.max(0, -grid);
    const residual = sources - sinks;
    const lossAllowed = 150 + sources * 0.15;
    const note = gridKnown ? "" : " (قدرة الشبكة غير مُبلَّغة فاعتُبرت صفراً)";
    if (residual < -(100 + sinks * 0.05)) add("calc", "balance", gridKnown ? "fail" : "warn", "توازن الطاقة", `المخارج تتجاوز المداخل بـ ${fmt(-residual, 0)}W${note}: ${gridKnown ? "قراءة متناقضة." : "على الأرجح الشبكة تغذي المنزل أو البطارية."}`);
    else if (residual > lossAllowed) add("calc", "balance", "warn", "توازن الطاقة", `فقد غير مفسَّر ${fmt(residual, 0)}W (المسموح ≈ ${fmt(lossAllowed, 0)}W)${note}.`);
    else add("calc", "balance", "pass", "توازن الطاقة", `ألواح + شبكة + تفريغ − حمل − شحن − تصدير = ${fmt(residual, 0)}W (فقد الإنفرتر الطبيعي)${note}.`);
  }

  if (isNum(reading.loadPercent) && isNum(load) && ratedKw) {
    const expected = (reading.loadPercent / 100) * ratedKw * 1000;
    const gap = Math.abs(expected - load);
    add("calc", "load-pct", gap > Math.max(250, expected * 0.3) ? "warn" : "pass", "الحمل مقابل نسبة حمل الإنفرتر", `${fmt(reading.loadPercent, 0)}% من ${fmt(ratedKw * 1000, 0)}W ≈ ${fmt(expected, 0)}W مقابل ${fmt(load, 0)}W المقروءة.`);
  }

  if (limits && isNum(settings?.inverterRatedPowerKw) && settings!.inverterRatedPowerKw! > limits.ratedPowerKw) {
    add("calc", "rated", "fail", "قدرة الإنفرتر في الإعدادات", `${settings!.inverterRatedPowerKw}kW تتجاوز قدرة اللوحة ${limits.ratedPowerKw}kW.`);
  }
  if (panelW !== null && (panelW < 100 || panelW > 100_000)) {
    add("calc", "panel-w", "fail", "سعة الألواح في الإعدادات", `${fmt(panelW, 0)}W غير معقولة؛ الحقل بالكيلوواط (لألواح 6000W اكتب 6).`);
  }

  // ───────────── الأيقونات والبطاقات المنسدلة ─────────────
  const kwOf = (w: number | undefined) => (isNum(w) ? Math.abs(w) / 1000 : null);
  const cards: Array<[string, string, number | undefined, boolean]> = [
    ["solar", "أيقونة وبطاقة الشمس", pv, isNum(pv) && pv > FLOW_W],
    ["home", "أيقونة وبطاقة المنزل", load, isNum(load) && load > FLOW_W],
    ["battery", "أيقونة وبطاقة البطارية", batW, isNum(batW) && Math.abs(batW) > FLOW_W],
  ];
  for (const [key, label, watts, active] of cards) {
    const kw = kwOf(watts);
    add("ui", `ui-${key}`, kw === null ? "fail" : "pass", label, kw === null ? "لا توجد قيمة لعرضها؛ ستظهر الأيقونة خاملة بلا رقم." : `${active ? "نشطة" : "خاملة"} وتعرض ${fmt(kw, 2)} kW و${fmt(acA(kw * 1000))}A.`);
  }
  if (isNum(batW)) {
    const label = batW > FLOW_W ? "تشحن" : batW < -FLOW_W ? "تفرغ" : "ثابتة";
    const mismatch = isNum(batI) && Math.abs(batI) > 1 && Math.abs(batW) > FLOW_W && Math.sign(batI) !== Math.sign(batW);
    add("ui", "ui-battery-state", mismatch ? "fail" : "pass", "حالة البطارية في البطاقة", mismatch ? `البطاقة ستكتب «${label}» لكن إشارة التيار (${fmt(batI!)}A) تقول العكس.` : `تُعرض «${label}».`);
  }
  {
    const w = reading.gridPowerW;
    const contradiction = reading.gridConnected === false && isNum(w) && Math.abs(w) > FLOW_W;
    const state = reading.gridConnected == null ? "غير معروفة" : reading.gridConnected ? "متصلة" : "مقطوعة";
    add("ui", "ui-grid", contradiction ? "fail" : "pass", "أيقونة وبطاقة الشبكة", contradiction ? `ستظهر «مقطوعة» بينما القدرة ${fmt(Math.abs(w!), 0)}W تمر منها.` : `الحالة «${state}»${isNum(w) ? ` والقدرة ${fmt(Math.abs(w) / 1000, 2)} kW` : ""}.`);
  }
  if (isNum(pv) && isNum(batW)) {
    const through = Math.max(0, pv) + Math.max(0, reading.gridPowerW ?? 0) + Math.max(0, -batW);
    add("ui", "ui-inverter", "pass", "بطاقة الإنفرتر (الطاقة المارّة)", `${fmt(through / 1000, 2)} kW و${fmt(acA(through))}A.`);
  }

  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0 };
  for (const item of items) counts[item.status] += 1;
  return { ok: counts.fail === 0, counts, items };
}
