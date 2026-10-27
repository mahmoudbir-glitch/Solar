import type { EnergySnapshot } from "@/lib/energy";

/** The app's name as the card speaks of itself. */
const APP_NAME = "Solar";

export type IntelligentEnergySettings = {
  batteryCapacityWh: number;
  batteryMinReservePct: number;
  /** Inverter rating from Settings; the load share falls back to it when the inverter sends no load percent. */
  inverterRatedPowerKw?: number | null;
};

export type IntelligentEnergyContext = {
  recentAverageHomePowerW?: number | null;
  batterySocDropPerHour?: number | null;
  recentAverageSolarPowerW?: number | null;
  /** The sun is down at the site: no solar comparison, and the wording says so. */
  isNight?: boolean;
  /** Within about an hour and a half of sunrise or sunset, when falling production is normal. */
  sunLow?: boolean;
};

export type IntelligentInsight = {
  tone: "green" | "amber" | "red" | "blue";
  title: string;
  summary: string;
  action: string;
  recommendation?: string;
  details: string[];
  alert: boolean;
};

/** One reading (or a ten-minute average of readings) used to judge the recent trend. */
export type TrendPoint = { t: number; homePowerW: number; solarPowerW: number; batterySoc: number };

/** Only readings this recent describe "now"; older ones belong to another part of the day. */
export const TREND_WINDOW_MS = 60 * 60_000;
/** A battery's percent moves in whole steps, so a rate needs this long to mean anything. */
const TREND_MIN_SPAN_MS = 15 * 60_000;

/**
 * Recent averages and the battery's rate of fall from the last hour of
 * readings. The averages leave out the newest reading (it is the one being
 * compared with them), and nothing is reported from fewer than three readings.
 */
export function trendContext(points: TrendPoint[], now: number): Required<Pick<IntelligentEnergyContext, "recentAverageHomePowerW" | "recentAverageSolarPowerW" | "batterySocDropPerHour">> {
  const recent = points
    .filter((point) => Number.isFinite(point.t) && point.t <= now && now - point.t <= TREND_WINDOW_MS && Number.isFinite(point.homePowerW) && Number.isFinite(point.solarPowerW) && Number.isFinite(point.batterySoc))
    .sort((a, b) => a.t - b.t);
  if (recent.length < 3) return { recentAverageHomePowerW: null, recentAverageSolarPowerW: null, batterySocDropPerHour: null };

  const earlier = recent.slice(0, -1);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const span = last.t - first.t;
  const drop = first.batterySoc - last.batterySoc;
  return {
    recentAverageHomePowerW: average(earlier.map((point) => Math.max(0, point.homePowerW))),
    recentAverageSolarPowerW: average(earlier.map((point) => Math.max(0, point.solarPowerW))),
    batterySocDropPerHour: span >= TREND_MIN_SPAN_MS && drop >= 2 ? drop / (span / 3_600_000) : null,
  };
}

/**
 * Figures with Latin units sit inside Arabic sentences; without isolating them
 * "7.8 kW" is drawn as "kW 7.8" and "20%" as "%20".
 */
const ltr = (text: string) => `\u2066${text}\u2069`;
const kw = (value: number) => ltr(`${value.toFixed(1)} kW`);
const pct = (value: number) => ltr(`${Math.round(value)}%`);

const safeNumber = (value: number | null | undefined, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** "3 ساعات و5 دقائق تقريباً", with the Arabic plural forms. */
function formatDuration(minutes: number) {
  if (minutes < 1) return "أقل من دقيقة";
  const hours = Math.floor(minutes / 60);
  if (hours >= 48) return "أكثر من 48 ساعة";
  const rest = minutes % 60;
  const unit = (n: number, one: string, two: string, few: string, many: string) =>
    n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  const h = hours ? unit(hours, "ساعة", "ساعتان", "ساعات", "ساعة") : "";
  const m = rest ? unit(rest, "دقيقة", "دقيقتان", "دقائق", "دقيقة") : "";
  return `${h && m ? `${h} و${m}` : h || m} تقريباً`;
}

function batteryEstimate(snapshot: EnergySnapshot, settings: IntelligentEnergySettings) {
  const soc = Math.min(100, Math.max(0, safeNumber(snapshot.batterySoc)));
  const powerW = safeNumber(snapshot.batteryPowerW);
  const capacityWh = safeNumber(settings.batteryCapacityWh);
  const reservePct = Math.min(99, Math.max(0, safeNumber(settings.batteryMinReservePct, 20)));
  if (capacityWh <= 0 || Math.abs(powerW) < 50) return null;

  const charging = powerW > 0;
  const usableWh = charging
    ? ((100 - soc) / 100) * capacityWh
    : (Math.max(0, soc - reservePct) / 100) * capacityWh;
  if (!charging && usableWh <= 0) return { charging, label: "عند حد الاحتياطي" };

  const hours = usableWh / Math.abs(powerW);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return { charging, label: formatDuration(Math.round(hours * 60)) };
}

/** Inverter temperature the home page already marks in red. */
const INVERTER_HOT_C = 60;
const INVERTER_VERY_HOT_C = 75;
/** Battery temperature the battery page already calls high. */
const BATTERY_HOT_C = 45;
const BATTERY_VERY_HOT_C = 55;
/** Panel power at night above this is a wrong reading, not production. */
const NIGHT_SOLAR_TOLERANCE_W = 100;
/** Share of the inverter's rating from which the load counts as near its limit. */
const NEAR_LIMIT_PCT = 90;

export function analyzeEnergy(
  snapshot: EnergySnapshot,
  settings?: IntelligentEnergySettings,
  context?: IntelligentEnergyContext,
): IntelligentInsight {
  const isNight = context?.isNight === true;
  // After sunset the panels give nothing; a reading that says otherwise is
  // reported as such below and never counted as production.
  const reportedSolarW = Math.max(0, safeNumber(snapshot.solarPowerW));
  const solarW = isNight ? 0 : reportedSolarW;
  const solarKw = solarW / 1000;
  const homeKw = Math.max(0, safeNumber(snapshot.homePowerW)) / 1000;
  const gridImport = Math.max(0, safeNumber(snapshot.gridPowerW)) / 1000;
  const soc = Math.min(100, Math.max(0, safeNumber(snapshot.batterySoc)));
  const batteryPowerW = safeNumber(snapshot.batteryPowerW);
  const batteryDischarging = batteryPowerW < -50;
  const batteryCharging = batteryPowerW > 50;
  const solarSurplus = Math.max(0, solarKw - homeKw);
  const reservePct = settings ? Math.min(99, Math.max(0, safeNumber(settings.batteryMinReservePct, 20))) : 20;
  const nearReserve = batteryDischarging && soc > reservePct && soc <= reservePct + 5;
  const estimate = settings ? batteryEstimate(snapshot, settings) : null;
  const estimateDetail = estimate
    ? estimate.charging
      ? `بالقدرة الحالية، تحتاج البطارية ${estimate.label} للوصول إلى ${pct(100)}.`
      : estimate.label === "عند حد الاحتياطي"
        ? "البطارية عند حد الاحتياطي، فلم يبقَ منها ما يُستخدم."
        : `بالقدرة الحالية، التقدير حتى حد الاحتياطي هو ${estimate.label}.`
    : null;
  const recentAverageW = context?.recentAverageHomePowerW;
  const batteryDropPerHour = context?.batterySocDropPerHour;
  const recentAverageSolarW = context?.recentAverageSolarPowerW;
  const rapidBatteryDrop =
    batteryDischarging &&
    typeof batteryDropPerHour === "number" &&
    Number.isFinite(batteryDropPerHour) &&
    batteryDropPerHour >= 8;
  // An off-grid inverter holds the panels back once the battery is full, and
  // production falls on its own around sunrise and sunset: neither is a fault.
  const solarThrottled = soc >= 95 && !batteryDischarging;
  const solarDrop =
    !isNight &&
    !context?.sunLow &&
    !solarThrottled &&
    typeof recentAverageSolarW === "number" &&
    Number.isFinite(recentAverageSolarW) &&
    recentAverageSolarW >= 800 &&
    solarW <= recentAverageSolarW * 0.55 &&
    recentAverageSolarW - solarW >= 400;
  const solarDropDetail = solarDrop
    ? `الإنتاج الشمسي الحالي أقل من متوسط القراءات الأخيرة بنحو ${pct((1 - solarW / recentAverageSolarW) * 100)}.`
    : null;
  const unusualLoad =
    typeof recentAverageW === "number" &&
    Number.isFinite(recentAverageW) &&
    recentAverageW >= 500 &&
    snapshot.homePowerW >= recentAverageW * 1.6 &&
    snapshot.homePowerW - recentAverageW >= 800;
  /** Above the usual load and not simply absorbed by spare sun. */
  const unusualLoadMatters = unusualLoad && (batteryDischarging || gridImport > 0.2 || solarKw < homeKw);
  const unusualLoadDetail = unusualLoad
    ? `الاستهلاك الحالي أعلى من متوسط القراءات الأخيرة بنحو ${pct((snapshot.homePowerW / recentAverageW - 1) * 100)}.`
    : null;
  const combinedEnergyStress =
    batteryDischarging &&
    soc > 10 &&
    soc <= 35 &&
    homeKw >= 1.5 &&
    solarKw < homeKw * 0.6 &&
    (solarDrop || unusualLoad || rapidBatteryDrop || homeKw >= 2.5);
  const largeLoad =
    homeKw >= 4 &&
    (unusualLoad || homeKw >= 5 || batteryDischarging || solarKw < homeKw * 0.5);

  // How much of the inverter's rating the house is taking: the inverter's own
  // figure when it sends one, otherwise the load against the saved rating.
  const ratedKw = safeNumber(settings?.inverterRatedPowerKw);
  const loadPct = typeof snapshot.loadPercent === "number" && Number.isFinite(snapshot.loadPercent)
    ? snapshot.loadPercent
    : ratedKw > 0 ? (homeKw / ratedKw) * 100 : null;
  const nearInverterLimit = loadPct !== null && loadPct >= NEAR_LIMIT_PCT;
  const inverterTemp = typeof snapshot.inverterTemperature === "number" && Number.isFinite(snapshot.inverterTemperature) ? snapshot.inverterTemperature : null;
  const batteryTemp = typeof snapshot.batteryTemperature === "number" && Number.isFinite(snapshot.batteryTemperature) ? snapshot.batteryTemperature : null;

  const loadTrendSupportsReserve =
    typeof recentAverageW === "number" &&
    Number.isFinite(recentAverageW) &&
    recentAverageW >= 500 &&
    snapshot.homePowerW >= recentAverageW * 1.15;
  const solarTrendSupportsReserve =
    !isNight &&
    typeof recentAverageSolarW === "number" &&
    Number.isFinite(recentAverageSolarW) &&
    recentAverageSolarW >= 500 &&
    solarW <= recentAverageSolarW * 0.85;
  const reserveTrendSupported =
    loadTrendSupportsReserve || solarTrendSupportsReserve || rapidBatteryDrop || isNight ||
    (recentAverageW == null && recentAverageSolarW == null);
  const hoursToReserve =
    batteryDischarging &&
    soc > reservePct &&
    typeof batteryDropPerHour === "number" &&
    Number.isFinite(batteryDropPerHour) &&
    batteryDropPerHour > 0 &&
    reserveTrendSupported
      ? (soc - reservePct) / batteryDropPerHour
      : null;
  const reserveSoon = hoursToReserve !== null && hoursToReserve <= 2;
  const reservePredictionDetail = reserveSoon
    ? `إذا استمر اتجاه البطارية مع ${isNight ? "الاستهلاك الحالي" : "ظروف الشمس والاستهلاك الحالية"}، قد تصل البطارية إلى حد الاحتياطي خلال ${formatDuration(Math.max(1, Math.round(hoursToReserve * 60)))}.`
    : null;
  const reserveContextDetail = reserveSoon
    ? loadTrendSupportsReserve && solarTrendSupportsReserve
      ? "التوقع مدعوم بارتفاع الاستهلاك عن متوسطه وانخفاض الإنتاج الشمسي عن متوسطه."
      : loadTrendSupportsReserve
        ? "التوقع مدعوم بارتفاع الاستهلاك الحالي عن متوسطه الأخير."
        : solarTrendSupportsReserve
          ? "التوقع مدعوم بانخفاض الإنتاج الشمسي الحالي عن متوسطه الأخير."
          : rapidBatteryDrop
            ? "التوقع مدعوم باستمرار معدل هبوط البطارية المرتفع مؤخراً."
            : "التوقع مبني على اتجاه هبوط البطارية الأخير فقط."
    : null;
  const solarVersusLoad = isNight
    ? `استهلاك المنزل ${kw(homeKw)} ولا إنتاج شمسي ليلاً.`
    : `الإنتاج الشمسي ${kw(solarKw)} مقابل استهلاك ${kw(homeKw)}.`;

  if (snapshot.stale) {
    return {
      tone: "amber",
      alert: true,
      title: "القراءة تحتاج انتباه",
      summary: "آخر قراءة ليست حية؛ لا نعتمد عليها لاتخاذ قرار فوري.",
      action: "تحقق من اتصال الإنفرتر أو الـ Gateway",
      details: ["تجنب تشغيل أحمال كبيرة اعتماداً على هذه القراءة.", `عند عودة البيانات الحية سيعيد ${APP_NAME} التحليل تلقائياً.`],
    };
  }

  // Protecting the equipment comes before managing the energy.
  if (nearInverterLimit) {
    return {
      tone: "red",
      alert: true,
      title: "الإنفرتر قريب من حده الأقصى",
      summary: `المنزل يسحب ${kw(homeKw)}، أي نحو ${pct(loadPct!)} من قدرة الإنفرتر.`,
      action: "أطفئ حملاً كبيراً الآن",
      recommendation: "تجاوز قدرة الإنفرتر يفصل الكهرباء عن المنزل؛ لا تشغّل جهازاً كبيراً آخر قبل أن ينخفض الحمل.",
      details: [
        ...(ratedKw > 0 ? [`قدرة الإنفرتر المحفوظة في الإعدادات ${ltr(`${ratedKw} kW`)}.`] : []),
        ...(unusualLoadDetail ? [unusualLoadDetail] : []),
        ...(batteryDischarging ? ["البطارية تساهم حالياً في تغذية هذا الحمل."] : []),
        ...(estimateDetail ? [estimateDetail] : []),
      ],
    };
  }

  if (inverterTemp !== null && inverterTemp >= INVERTER_HOT_C) {
    return {
      tone: inverterTemp >= INVERTER_VERY_HOT_C ? "red" : "amber",
      alert: true,
      title: "حرارة الإنفرتر مرتفعة",
      summary: `حرارة الإنفرتر ${ltr(`${Math.round(inverterTemp)}°C`)} والمنزل يسحب ${kw(homeKw)}.`,
      action: "خفّف الحمل وتأكد من تهوية الإنفرتر",
      recommendation: "الحرارة المرتفعة تقصّر عمر الإنفرتر وقد توقفه لحماية نفسه؛ تأكد أن فتحات التهوية والمراوح غير مسدودة.",
      details: [
        ...(loadPct !== null ? [`الحمل الحالي نحو ${pct(loadPct)} من قدرة الإنفرتر.`] : []),
        ...(unusualLoadDetail ? [unusualLoadDetail] : []),
      ],
    };
  }

  if (batteryTemp !== null && batteryTemp >= BATTERY_HOT_C) {
    return {
      tone: batteryTemp >= BATTERY_VERY_HOT_C ? "red" : "amber",
      alert: true,
      title: "حرارة البطارية مرتفعة",
      summary: `حرارة البطارية ${ltr(`${Math.round(batteryTemp)}°C`)}${batteryCharging ? " وهي تشحن حالياً" : batteryDischarging ? " وهي تفرغ حالياً" : ""}.`,
      action: "خفّف الأحمال الكبيرة وهوِّ مكان البطارية",
      recommendation: "الحرارة المرتفعة تقصّر عمر البطارية؛ إذا استمرت، راجع مكان تركيبها وتهويته.",
      details: [`قدرة البطارية الآن ${kw((Math.abs(batteryPowerW) / 1000))}.`, ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  if (soc <= 10) {
    return {
      tone: "red",
      alert: true,
      title: "البطارية منخفضة جداً",
      summary: `البطارية عند ${pct(soc)}${batteryDischarging ? " وتفرغ حالياً" : batteryCharging ? " وتشحن حالياً" : ""}.`,
      action: "خفّف الأحمال غير الضرورية",
      recommendation: "يفضل تأجيل الأحمال المرنة حتى تتحسن حالة البطارية.",
      details: ["الأولوية الآن للحفاظ على الطاقة للأحمال الأساسية.", gridImport > 0 ? "الشبكة تساهم حالياً في تغذية المنزل." : "لا يظهر سحب من الشبكة في القراءة الحالية.", ...(unusualLoadDetail ? [unusualLoadDetail] : []), ...(solarDropDetail ? [solarDropDetail] : []), ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  // At or under the saved reserve and still falling: every later rule assumes
  // there is something left above it.
  if (batteryDischarging && soc <= reservePct) {
    return {
      tone: "red",
      alert: true,
      title: "البطارية عند حد الاحتياطي",
      summary: `البطارية عند ${pct(soc)} وما زالت تفرغ، والاحتياطي مضبوط على ${pct(reservePct)}.`,
      action: "خفّف الأحمال غير الضرورية الآن",
      recommendation: isNight
        ? "أبقِ الأحمال الأساسية فقط حتى تعود الشمس أو الشبكة."
        : "أبقِ الأحمال الأساسية فقط حتى يبدأ الشحن.",
      details: [
        solarVersusLoad,
        gridImport > 0 ? "الشبكة تساهم حالياً في تغذية المنزل." : "لا يظهر سحب من الشبكة في القراءة الحالية.",
        ...(unusualLoadDetail ? [unusualLoadDetail] : []),
        ...(rapidBatteryDrop ? [`معدل هبوط البطارية الأخير يقارب ${pct(batteryDropPerHour!)} بالساعة.`] : []),
      ],
    };
  }

  if (combinedEnergyStress) {
    const solarCoverage = Math.max(0, Math.min(100, Math.round((solarKw / homeKw) * 100)));
    return {
      tone: soc <= 20 || rapidBatteryDrop ? "red" : "amber",
      alert: true,
      title: "البطارية تحت ضغط",
      summary: isNight
        ? `الشمس غائبة والبطارية عند ${pct(soc)} وتغذّي حملاً قدره ${kw(homeKw)}.`
        : `الشمس تغطي نحو ${pct(solarCoverage)} من استهلاك المنزل والبطارية عند ${pct(soc)} وتفرغ حالياً.`,
      action: "خفّف الأحمال غير الضرورية الآن",
      recommendation: rapidBatteryDrop
        ? "استمرار الوضع قد يقرّب البطارية من الاحتياطي بسرعة."
        : isNight
          ? "يفضل تأجيل الأحمال المرنة إلى النهار."
          : "يفضل تأجيل الأحمال المرنة حتى يتحسن الإنتاج أو ينخفض الاستهلاك.",
      details: [
        solarVersusLoad,
        ...(solarDropDetail ? [solarDropDetail] : []),
        ...(unusualLoadDetail ? [unusualLoadDetail] : []),
        ...(rapidBatteryDrop ? [`معدل هبوط البطارية الأخير يقارب ${pct(batteryDropPerHour!)} بالساعة.`] : []),
        ...(reservePredictionDetail ? [reservePredictionDetail] : []),
        ...(reserveContextDetail ? [reserveContextDetail] : []),
        ...(estimateDetail ? [estimateDetail] : []),
      ],
    };
  }

  if (largeLoad) {
    return {
      tone: batteryDischarging ? "red" : "amber",
      alert: true,
      title: "حمل كبير يعمل الآن",
      summary: `استهلاك المنزل وصل إلى ${kw(homeKw)}، وهو حمل كبير على المنظومة حالياً.`,
      action: "تحقق من الأجهزة الكبيرة التي تعمل الآن",
      recommendation: batteryDischarging
        ? "إذا لم يكن الحمل ضرورياً، خفّفه لتقليل سرعة هبوط البطارية."
        : "إذا كان الحمل غير ضروري، يفضل تشغيله عندما تكون الطاقة الشمسية أعلى.",
      details: [
        solarVersusLoad,
        ...(loadPct !== null ? [`الحمل الحالي نحو ${pct(loadPct)} من قدرة الإنفرتر.`] : []),
        ...(unusualLoadDetail ? [unusualLoadDetail] : []),
        ...(batteryDischarging ? ["البطارية تساهم حالياً في تغذية هذا الحمل."] : []),
        ...(!isNight && solarKw < homeKw ? ["الإنتاج الشمسي لا يغطي كامل الحمل الحالي."] : []),
        ...(reservePredictionDetail ? [reservePredictionDetail] : []),
        ...(reserveContextDetail ? [reserveContextDetail] : []),
        ...(estimateDetail ? [estimateDetail] : []),
      ],
    };
  }

  if (batteryDischarging && soc <= 20 && homeKw >= 2) {
    return {
      tone: "red",
      alert: true,
      title: "استهلاك مرتفع مع بطارية منخفضة",
      summary: `المنزل يسحب ${kw(homeKw)} والبطارية عند ${pct(soc)}.`,
      action: "راجع الأحمال الكبيرة الآن",
      recommendation: "يفضل تأجيل الأحمال المرنة لتقليل سرعة هبوط البطارية.",
      details: ["تشغيل سخان أو مكيف أو حمل كبير قد يسرّع هبوط البطارية.", "إذا كان هناك حمل غير ضروري، إيقافه قد يطيل وقت التشغيل.", ...(unusualLoadDetail ? [unusualLoadDetail] : []), ...(solarDropDetail ? [solarDropDetail] : []), ...(reservePredictionDetail ? [reservePredictionDetail] : []), ...(reserveContextDetail ? [reserveContextDetail] : []), ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  if (nearReserve) {
    return {
      tone: "amber",
      alert: true,
      title: "البطارية تقترب من الاحتياطي",
      summary: `البطارية عند ${pct(soc)} وتفرغ حالياً، والاحتياطي مضبوط على ${pct(reservePct)}.`,
      action: "خفّف أو أجّل الأحمال المرنة",
      recommendation: "يفضل الحفاظ على الطاقة للأحمال الأساسية حتى تتوقف البطارية عن الهبوط أو يبدأ الشحن.",
      details: [`${APP_NAME} يعتمد هنا على حد الاحتياطي المحفوظ في إعدادات البطارية.`, ...(solarDropDetail ? [solarDropDetail] : []), ...(reservePredictionDetail ? [reservePredictionDetail] : []), ...(reserveContextDetail ? [reserveContextDetail] : []), ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  if (reserveSoon) {
    return {
      tone: "red",
      alert: true,
      title: "البطارية قد تصل للاحتياطي قريباً",
      summary: reservePredictionDetail!,
      action: "خفّف الأحمال غير الضرورية الآن",
      recommendation: "التوقع مبني على اتجاه البطارية في آخر ساعة؛ إذا تغيّر الاستهلاك أو الإنتاج سيتغير التقدير تلقائياً.",
      details: [
        `البطارية عند ${pct(soc)} والاحتياطي مضبوط على ${pct(reservePct)}.`,
        `معدل الهبوط الأخير يقارب ${pct(batteryDropPerHour!)} بالساعة.`,
        ...(reserveContextDetail ? [reserveContextDetail] : []),
        ...(solarDropDetail ? [solarDropDetail] : []),
        ...(unusualLoadDetail ? [unusualLoadDetail] : []),
      ],
    };
  }

  if (rapidBatteryDrop) {
    return {
      tone: "amber",
      alert: true,
      title: "البطارية تهبط بسرعة",
      summary: `معدل هبوط البطارية الأخير يقارب ${pct(batteryDropPerHour!)} بالساعة.`,
      action: "خفّف الأحمال غير الضرورية",
      recommendation: "إذا استمر هذا المعدل، أجّل الأحمال المرنة وراقب سبب ارتفاع الاستهلاك.",
      details: [`${APP_NAME} يقارن قراءات البطارية في آخر ساعة، وليس قراءة واحدة فقط.`, ...(unusualLoadDetail ? [unusualLoadDetail] : []), ...(solarDropDetail ? [solarDropDetail] : []), ...(reservePredictionDetail ? [reservePredictionDetail] : []), ...(reserveContextDetail ? [reserveContextDetail] : []), ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  if (solarDrop) {
    return {
      tone: "amber",
      alert: true,
      title: "الإنتاج الشمسي منخفض",
      summary: `الإنتاج الحالي ${kw(solarKw)} أقل بوضوح من متوسط الإنتاج الشمسي الأخير.`,
      action: "راقب الألواح والإنفرتر",
      recommendation: "إذا كانت السماء صافية، تحقق من وجود ظل أو اتساخ أو مشكلة في اتصال الإنفرتر.",
      details: [`${APP_NAME} يقارن الإنتاج الحالي بقراءات آخر ساعة، وليس قراءة واحدة.`, solarDropDetail!, ...(homeKw > solarKw ? ["الاستهلاك الحالي أعلى من الإنتاج الشمسي، لذلك قد تعتمد المنظومة أكثر على البطارية أو الشبكة."] : [])],
    };
  }

  if (unusualLoadMatters) {
    return {
      tone: "amber",
      alert: true,
      title: "الاستهلاك أعلى من المعتاد",
      summary: `الاستهلاك الحالي ${kw(homeKw)} أعلى بوضوح من متوسطك الأخير.`,
      action: "تحقق من الأجهزة التي تعمل الآن",
      recommendation: "إذا لم يكن الحمل ضرورياً، خفّفه مؤقتاً حتى يعود الاستهلاك لمعدله المعتاد.",
      details: [unusualLoadDetail!, "قد يكون السبب جهازاً كبيراً بدأ العمل أو عدة أحمال تعمل معاً.", ...(solarDropDetail ? [solarDropDetail] : []), ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  if (isNight && reportedSolarW > NIGHT_SOLAR_TOLERANCE_W) {
    return {
      tone: "amber",
      alert: true,
      title: "قراءة الإنتاج الشمسي غير منطقية",
      summary: `الوقت الآن بعد غروب الشمس، لكن الإنفرتر يرسل ${kw((reportedSolarW / 1000))} كإنتاج شمسي.`,
      action: "تحقق من قراءة الإنفرتر أو SmartESS/Gateway",
      recommendation: `${APP_NAME} لا يعتبر هذه القراءة إنتاجاً شمسياً ليلاً، ولا ينبّه لانخفاض الإنتاج بسببها.`,
      details: ["عُرف الليل من موقع المنظومة ووقتَي الشروق والغروب المحسوبين له.", "إذا استمرت القراءة عدة مرات، راجع مصدر قدرة الألواح أو اتصال الدنجل."],
    };
  }

  // The battery is full and the sun is up: an off-grid inverter now throws
  // away whatever the house does not take, so this is the moment to use it.
  if (!isNight && solarThrottled && solarKw >= 0.3) {
    return {
      tone: "green",
      alert: false,
      title: "البطارية ممتلئة والشمس متوفرة",
      summary: `البطارية عند ${pct(soc)} والألواح تعطي ${kw(solarKw)}؛ ما لا يستهلكه المنزل الآن يضيع.`,
      action: "شغّل الأحمال المرنة الآن",
      recommendation: "الغسالة وسخان الماء ومضخة المياه تعمل الآن من الشمس مباشرة دون أن تأخذ من البطارية.",
      details: ["عند امتلاء البطارية يخفّض الإنفرتر إنتاج الألواح إلى ما يحتاجه المنزل فقط، فالرقم الظاهر أقل من قدرتها الفعلية.", solarVersusLoad],
    };
  }

  if (solarSurplus >= 0.8 && soc < 90) {
    return {
      tone: "green",
      alert: false,
      title: "وقت جيد لاستخدام الطاقة الشمسية",
      summary: `يوجد فائض شمسي يقارب ${kw(solarSurplus)} والبطارية ليست ممتلئة.`,
      action: "يمكنك تشغيل حمل إضافي باعتدال",
      recommendation: "الآن وقت مناسب لتشغيل حمل مرن، ما دام الفائض الشمسي مستمراً.",
      details: ["الإنتاج الشمسي أعلى من استهلاك المنزل.", "يفضل الاستفادة من الأحمال المرنة أثناء وجود الشمس.", ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  if (batteryCharging && solarKw > homeKw && soc < 95) {
    return {
      tone: "green",
      alert: false,
      title: "المنظومة تعمل بكفاءة جيدة",
      summary: `الشمس تغطي الاستهلاك والبطارية تشحن عند ${pct(soc)}.`,
      action: "لا يوجد إجراء مطلوب",
      recommendation: "يمكنك الاستفادة من الطاقة الشمسية للأحمال المرنة دون الحاجة لتدخل الآن.",
      details: ["الإنتاج الشمسي أعلى من حمل المنزل حالياً.", "جزء من الطاقة يذهب لشحن البطارية.", ...(estimateDetail ? [estimateDetail] : [])],
    };
  }

  if (gridImport >= 1 && solarKw < 0.5) {
    return {
      tone: "blue",
      alert: false,
      title: "المنزل يعتمد على الشبكة الآن",
      summary: `السحب من الشبكة يقارب ${kw(gridImport)}.`,
      action: isNight ? "لا يوجد إجراء مطلوب" : "راقب عودة الإنتاج الشمسي",
      recommendation: isNight
        ? "الأحمال المرنة أرخص نهاراً من الشمس؛ أجّلها إن أمكن."
        : "يفضل تأجيل الأحمال المرنة إذا لم تكن ضرورية حتى تتحسن الطاقة الشمسية.",
      details: [
        isNight ? "الشمس غائبة، والشبكة تغذّي المنزل." : "الإنتاج الشمسي منخفض في هذه اللحظة.",
        ...(batteryCharging ? ["جزء من سحب الشبكة يذهب لشحن البطارية."] : []),
        ...(estimateDetail ? [estimateDetail] : []),
      ],
    };
  }

  if (isNight) {
    return {
      tone: "blue",
      alert: false,
      title: "وضع الليل",
      summary: `الشمس غائبة الآن. استهلاك المنزل ${kw(homeKw)} والبطارية ${pct(soc)}.`,
      action: "لا يوجد إجراء مطلوب",
      recommendation: "في الليل تُراقَب البطارية والشبكة، ولا يُقارَن الإنتاج بمتوسط النهار.",
      details: [
        batteryDischarging ? "البطارية تغذّي المنزل حالياً." : gridImport > 0 ? "الشبكة تغذّي المنزل حالياً." : "لا سحب يُذكر من البطارية الآن.",
        ...(estimateDetail ? [estimateDetail] : []),
        `سيغيّر ${APP_NAME} هذه البطاقة تلقائياً إذا تغيرت حالة المنظومة.`,
      ],
    };
  }

  return {
    tone: "green",
    alert: false,
    title: "الوضع طبيعي",
    summary: `الاستهلاك ${kw(homeKw)} والبطارية ${pct(soc)}.`,
    action: "استمر بالمراقبة",
    details: ["لا توجد إشارة واضحة لحالة حرجة في القراءة الحالية.", ...(estimateDetail ? [estimateDetail] : []), `سيغيّر ${APP_NAME} هذه البطاقة تلقائياً إذا تغيرت حالة المنظومة.`],
  };
}
