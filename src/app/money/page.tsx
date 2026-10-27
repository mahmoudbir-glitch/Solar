"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Calculator, ChevronDown, Info, PiggyBank, RotateCw, Settings2, TrendingUp, Zap } from "lucide-react";
import { moneyText, moneyTone, semanticBg, semanticBorder, semanticText } from "@/lib/energy";
import { StatTile } from "@/components/stat-tile";
import { percentsOf } from "@/lib/energy";

type Period = "day" | "week" | "month" | "custom";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "اليوم" },
  { key: "week", label: "أسبوع" },
  { key: "month", label: "شهر" },
  { key: "custom", label: "مخصّصة" },
];

type FinanceData = {
  period?: Period;
  periodDays: number;
  range?: { from: string; to: string; requestedDays: number; firstDataDay: string | null; lastDataDay: string | null };
  totals: {
    solarKWh: number;
    homeKWh: number;
    batteryDischargeKWh: number;
    gridImportKWh: number;
    gridExportKWh: number;
  };
  sources: {
    solarPct: number;
    batteryPct: number;
    gridPct: number;
    solarKWh: number;
    batteryKWh: number;
    gridKWh: number;
    gridToBatteryKWh?: number;
  };
};

/* One meaning per colour on the whole page: amber the sun, emerald the battery and the saving, violet the grid. */
const sourceStyles = [
  { key: "solar", name: "الشمس مباشرة", color: "bg-amber-400", soft: "bg-amber-50", text: "text-amber-700" },
  { key: "battery", name: "البطارية", color: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700" },
  { key: "grid", name: "الشبكة", color: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700" },
] as const;

function formatNumber(value: number, digits = Math.abs(value) >= 100 ? 0 : 1) {
  return value.toLocaleString("ar-u-nu-latn", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** How many local days each fixed period asks for (same values as /api/finance). */
const PERIOD_DAYS: Record<Exclude<Period, "custom">, number> = { day: 1, week: 7, month: 30 };
/** Fewer days with readings than this and a monthly/yearly projection would mostly be noise. */
const MIN_DAYS_FOR_ESTIMATE = 3;

/** "يوم" / "يومين" / "3 أيام" / "12 يوماً": the Arabic count of days. */
function daysCount(n: number) {
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  return `${n} ${n >= 3 && n <= 10 ? "أيام" : "يوماً"}`;
}

/** "64 دولاراً" / "5 دولارات" / "دولارين" / "30 ليرة": an amount out of 100 in words that agree with the number. */
function outOf100(n: number, currency: string) {
  const syp = currency === "SYP";
  if (n === 1) return syp ? "ليرة واحدة" : "دولاراً واحداً";
  if (n === 2) return syp ? "ليرتين" : "دولارين";
  if (n >= 3 && n <= 10) return `${n} ${syp ? "ليرات" : "دولارات"}`;
  if (n === 100) return `100 ${syp ? "ليرة" : "دولار"}`;
  return `${n} ${syp ? "ليرة" : "دولاراً"}`;
}

/** A local day "YYYY-MM-DD" as "3 تشرين الأول" (Levantine month names) (the year only when it is not this year). */
function dayLabel(day: string) {
  const date = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(date.getTime())) return day;
  const sameYear = date.getUTCFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("ar-SY-u-nu-latn", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** Today in the browser's own calendar, as "YYYY-MM-DD". */
function localToday() {
  return new Date().toLocaleDateString("en-CA");
}
function shiftDay(day: string, days: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const ERRORS: Record<string, string> = {
  invalid_range: "نطاق التواريخ غير صالح. تأكد أن تاريخ البداية قبل تاريخ النهاية وليس بعد اليوم.",
  range_too_long: "أقصى مدة يمكن عرضها 366 يوماً. اختر نطاقاً أقصر.",
};

export default function MoneyDashboard() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState(() => shiftDay(localToday(), -13));
  const [customTo, setCustomTo] = useState(() => localToday());
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [tariff, setTariff] = useState(0);
  const [exportTariff, setExportTariff] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Saving is only allowed once the real tariffs arrived, so the 0 placeholders
  // can never overwrite them.
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then(async (settingsResponse) => {
        if (!settingsResponse.ok) return;
        const settings = await settingsResponse.json();
        setTariff(Number(settings.gridTariff || 0));
        setExportTariff(Number(settings.exportTariff || 0));
        setCurrency(settings.currency === "SYP" ? "SYP" : "USD");
        setSettingsLoaded(true);
      })
      .catch(() => undefined);
  }, []);

  // The figures follow the chosen period; a late answer for an older choice
  // must not replace the current one. A custom period waits for its dates.
  useEffect(() => {
    if (period === "custom" && !customRange) {
      setLoading(false);
      setLoadError("");
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    const query = period === "custom" && customRange ? `period=custom&from=${customRange.from}&to=${customRange.to}` : `period=${period}`;
    fetch(`/api/finance?${query}`, { cache: "no-store" })
      .then(async (financeResponse) => {
        if (cancelled) return;
        if (!financeResponse.ok) {
          const body = (await financeResponse.json().catch(() => ({}))) as { error?: string };
          setData(null);
          setLoadError(ERRORS[body.error ?? ""] ?? "تعذّر تحميل أرقام المال الآن. تحقق من الاتصال ثم أعد المحاولة.");
          return;
        }
        setData((await financeResponse.json()) as FinanceData);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoadError("تعذّر تحميل أرقام المال الآن. تحقق من الاتصال ثم أعد المحاولة.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, customRange, reloadKey]);

  // What the house used, priced at the grid tariff: the cost without the system.
  const hypotheticalCost = data
    ? (data.sources.solarKWh + data.sources.batteryKWh + data.sources.gridKWh) * tariff
    : 0;
  const gridCost = data ? data.totals.gridImportKWh * tariff : 0;
  const exportIncome = data ? data.totals.gridExportKWh * exportTariff : 0;
  // Saving = the cost without the system − what was really paid + export income.
  // Pricing the battery's share as saved counted grid energy twice whenever the
  // grid charged the battery (paid once on import, "saved" again on discharge).
  const savedAmount = useMemo(() => hypotheticalCost - gridCost + exportIncome, [hypotheticalCost, gridCost, exportIncome]);
  const savedTone = moneyTone(savedAmount);
  const formatMoney = (n: number) => <bdi dir="ltr">{moneyText(currency, n)}</bdi>;

  // Every share below comes from the same three figures, so they always agree with each other.
  const savedPctOfCost = hypotheticalCost > 0 ? Math.round((savedAmount / hypotheticalCost) * 100) : 0;
  const paidBarPct = hypotheticalCost > 0 ? Math.max(0, Math.min(100, (gridCost / hypotheticalCost) * 100)) : 0;
  const savedBarPct = savedAmount > 0 ? Math.max(0, 100 - paidBarPct) : 0;
  const perDaySaved = data && data.periodDays > 0 ? savedAmount / data.periodDays : 0;
  const homeKWh = data ? data.sources.solarKWh + data.sources.batteryKWh + data.sources.gridKWh : 0;
  const gridToBatteryKWh = data?.sources.gridToBatteryKWh ?? 0;
  const requestedDays = data?.range?.requestedDays ?? (period === "custom" ? 0 : PERIOD_DAYS[period]);
  const missingDays = data ? Math.max(0, requestedDays - data.periodDays) : 0;
  // The newest day with readings is older than the end of the range: the latest figures are missing, not zero.
  const staleData = Boolean(data?.range?.lastDataDay && data.range.to && data.range.lastDataDay < data.range.to && data.periodDays > 0);

  // Percentages from the kWh, rounded so the three always add up to 100.
  const [solarPct, batteryPct, gridPct] = data ? percentsOf([data.sources.solarKWh, data.sources.batteryKWh, data.sources.gridKWh]) : [0, 0, 0];
  const sourceRows = data
    ? sourceStyles.map((style) => {
        const values = {
          solar: { pct: solarPct, kwh: data.sources.solarKWh },
          battery: { pct: batteryPct, kwh: data.sources.batteryKWh },
          grid: { pct: gridPct, kwh: data.sources.gridKWh },
        }[style.key];

        return { ...style, pct: values.pct, kwh: values.kwh };
      })
    : [];

  const customInvalid = !customFrom || !customTo || customFrom > customTo || customFrom > localToday();

  const handleSave = async () => {
    if (!settingsLoaded) {
      setSaveError("لم تُحمَّل أسعارك المحفوظة بعد، فأُوقف الحفظ كي لا تُستبدل بأصفار. أعد تحميل الصفحة.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, gridTariff: tariff, exportTariff }),
      });

      if (!response.ok) throw new Error("settings_save_failed");

      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaved(false);
      setSaveError("تعذّر حفظ التغييرات. تحقق من الاتصال وحاول مجددًا.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-800 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100";
  const selectClass = inputClass + " appearance-auto";
  const card = "rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

  return (
    <div className="desktop-grid w-full space-y-3 pb-4 text-right" dir="rtl">
      <header className="px-1">
        <h1 className="text-xl font-black text-slate-950">المال والوفر</h1>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">كم وفّرت، وكم دفعت للشبكة، ومن أين جاءت كهرباء بيتك.</p>
      </header>

      <div role="tablist" aria-label="فترة التحليل" className="grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={period === item.key}
            onClick={() => setPeriod(item.key)}
            className={
              "min-h-10 rounded-xl text-sm font-black transition " +
              (period === item.key ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <form
          className={card + " desktop-wide"}
          onSubmit={(e) => {
            e.preventDefault();
            if (!customInvalid) setCustomRange({ from: customFrom, to: customTo });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] font-black text-slate-700">من</span>
              <input type="date" value={customFrom} max={localToday()} onChange={(e) => setCustomFrom(e.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-black text-slate-700">إلى</span>
              <input type="date" value={customTo} max={localToday()} onChange={(e) => setCustomTo(e.target.value)} className={inputClass} />
            </label>
          </div>
          {customInvalid && <p className="mt-2 text-[11px] font-bold text-rose-600">اختر تاريخ بداية قبل تاريخ النهاية، وليس بعد اليوم.</p>}
          <button type="submit" disabled={customInvalid} className="mt-3 min-h-11 w-full rounded-xl bg-teal-600 text-sm font-black text-white transition hover:bg-teal-700 disabled:opacity-50">
            عرض هذه الفترة
          </button>
        </form>
      )}

      {/* Which days the figures cover, and how many of them really have readings. */}
      {data?.range && data.periodDays > 0 && !loading && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] font-bold text-slate-600">
          <CalendarRange className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>{data.range.from === data.range.to ? dayLabel(data.range.from) : `من ${dayLabel(data.range.from)} إلى ${dayLabel(data.range.to)}`}</span>
          <span className="text-slate-300">•</span>
          <span className={missingDays > 0 ? "text-amber-700" : undefined}>
            {missingDays > 0 ? `البيانات متوفرة لـ${daysCount(data.periodDays)} من أصل ${requestedDays}` : `البيانات متوفرة لكل الأيام (${daysCount(data.periodDays)})`}
          </span>
          {staleData && data.range.lastDataDay && (
            <>
              <span className="text-slate-300">•</span>
              <span className="text-amber-700">آخر قراءة يومية: {dayLabel(data.range.lastDataDay)}</span>
            </>
          )}
        </p>
      )}

      {loading ? (
        <section className={card + " desktop-wide animate-pulse space-y-3"} aria-busy="true" aria-label="جاري التحميل">
          <div className="h-4 w-24 rounded bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="h-4 rounded-full bg-slate-100" />
          <div className="h-10 rounded-xl bg-slate-100" />
        </section>
      ) : loadError ? (
        <section role="alert" className="desktop-wide rounded-[1.5rem] border border-rose-200 bg-rose-50 p-5 text-center">
          <h2 className="text-sm font-black text-rose-800">لم تُحمَّل الأرقام</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-rose-700">{loadError}</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-black text-rose-700 ring-1 ring-rose-200">
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> إعادة المحاولة
          </button>
        </section>
      ) : period === "custom" && !customRange ? (
        <section className={card + " desktop-wide text-center"}>
          <p className="text-xs font-bold text-slate-600">اختر تاريخ البداية والنهاية ثم اضغط «عرض هذه الفترة».</p>
        </section>
      ) : !data || !data.periodDays ? (
        <section className={card + " desktop-wide text-center"}>
          <h2 className="text-base font-black text-slate-900">{period === "day" ? "لا قراءات لليوم بعد" : "لا توجد قراءات لهذه الفترة"}</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {period === "day"
              ? "تظهر أرقام اليوم مع وصول أول قراءات منظومتك. جرّب الأسبوع أو الشهر."
              : "يُحسب الوفر ومصادر الكهرباء من الأيام التي فيها قراءات فقط، ولا تُعدّ الأيام الفارغة صفراً."}
          </p>
        </section>
      ) : (
        <>
          {/* The money first: what was saved, then the two costs it comes from, on one bar. */}
          <section className={card + " desktop-wide"}>
            <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
              <PiggyBank className="h-5 w-5 text-emerald-600" aria-hidden="true" /> الوفر
            </h2>

            {/* With no price saved every amount is zero, which reads like "no savings". */}
            {settingsLoaded && tariff <= 0 ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                لم يُحدَّد سعر كيلوواط الشبكة بعد، لذلك لا يمكن حساب الوفر. افتح «سعر الكهرباء والعملة» في الأسفل وأدخل السعر.
              </p>
            ) : (
              <>
                <div className={"mt-3 rounded-2xl border px-4 py-3.5 " + semanticBorder[savedTone] + " " + semanticBg[savedTone]}>
                  <span className={"text-xs font-bold " + semanticText[savedTone]}>{savedAmount >= 0 ? "وفّرتَ" : "دفعتَ أكثر بـ"}</span>
                  <strong className={"mt-0.5 block text-4xl font-black leading-tight " + semanticText[savedTone]}>{formatMoney(Math.abs(savedAmount))}</strong>
                  <span className="mt-1 block text-[11px] font-semibold text-slate-600">وفر مقدّر في تكلفة كهرباء الشبكة</span>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-black text-slate-800">تكلفة الكهرباء المقدّرة دون المنظومة</span>
                    <span className="shrink-0 text-sm font-black text-slate-900">{formatMoney(hypotheticalCost)}</span>
                  </div>
                  <div className="mt-2 flex h-3.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60" role="img" aria-label={`دفعتَ ${Math.round(paidBarPct)}% ووفّرتَ ${Math.round(savedBarPct)}% من التكلفة المقدّرة`}>
                    <div className="bg-violet-500" style={{ width: paidBarPct + "%" }} />
                    <div className="bg-emerald-500" style={{ width: savedBarPct + "%" }} />
                  </div>
                  <dl className="mt-2.5 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-violet-50 px-3 py-2">
                      <dt className="flex items-center gap-1.5 text-[11px] font-bold text-violet-800"><span className="h-2 w-2 rounded-full bg-violet-500" />تكلفة كهرباء الشبكة</dt>
                      <dd className="mt-0.5 text-sm font-black text-violet-700">{formatMoney(gridCost)}</dd>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-3 py-2">
                      <dt className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-500" />الوفر</dt>
                      <dd className="mt-0.5 text-sm font-black text-emerald-700">{formatMoney(Math.max(0, savedAmount))}</dd>
                    </div>
                  </dl>
                  {exportIncome > 0 ? (
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">يشمل الوفر عائد بيع الفائض للشبكة {formatMoney(exportIncome)}.</p>
                  ) : savedAmount >= 0 ? (
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">مجموع الاثنين يساوي التكلفة المقدّرة دون المنظومة {formatMoney(hypotheticalCost)}.</p>
                  ) : null}
                </div>

                {/* The saving in one plain sentence. */}
                {savedPctOfCost > 0 && savedPctOfCost <= 100 && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-bold leading-6 text-slate-700">
                    <Info className="mt-1 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <span>من كل 100 {currency === "SYP" ? "ليرة" : "دولار"} كانت ستُدفع للشبكة، وفّرتَ نحو <strong className="font-black text-emerald-700">{outOf100(savedPctOfCost, currency)}</strong>.</span>
                  </p>
                )}
              </>
            )}
          </section>

          {/* Monthly and yearly pace, kept apart from the measured figures because it is an estimate. */}
          {tariff > 0 && savedAmount > 0 && (
            <section className={card}>
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
                <TrendingUp className="h-4 w-4 text-teal-600" aria-hidden="true" /> تقدير حسب المعدّل الحالي
              </h2>
              {data.periodDays >= MIN_DAYS_FOR_ESTIMATE ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <span className="text-[11px] font-bold text-slate-500">في الشهر</span>
                      <strong className="mt-0.5 block text-lg font-black text-emerald-700">≈ {formatMoney(Math.round(perDaySaved * 30))}</strong>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <span className="text-[11px] font-bold text-slate-500">في السنة</span>
                      <strong className="mt-0.5 block text-lg font-black text-emerald-700">≈ {formatMoney(Math.round(perDaySaved * 365))}</strong>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">
                    مبني على معدّل {formatMoney(perDaySaved)} يومياً من {daysCount(data.periodDays)} فيها قراءات. يتغيّر مع الاستهلاك والإنتاج والتعرفة.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">يظهر التقدير بعد تجمّع {daysCount(MIN_DAYS_FOR_ESTIMATE)} على الأقل من القراءات؛ اختر الأسبوع أو الشهر.</p>
              )}
            </section>
          )}

          <section className={card}>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
              <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" /> من أين جاءت كهرباء بيتك
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              من <bdi dir="ltr">{formatNumber(homeKWh)} kWh</bdi> وصلت فعلاً إلى أجهزة البيت
            </p>

            <div className="mt-3 flex h-3.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
              {sourceRows.map((row) => (
                <div key={row.key} className={row.color} style={{ width: String(Math.max(0, Math.min(100, row.pct))) + "%" }} title={row.name} />
              ))}
            </div>

            <ul className="mt-3 space-y-1.5">
              {sourceRows.map((row) => (
                <li key={row.key} className={"flex items-center justify-between gap-3 rounded-xl px-3 py-2 " + row.soft}>
                  <span className={"flex items-center gap-2 text-xs font-black " + row.text}>
                    <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + row.color} />
                    {row.name}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-[11px] font-bold text-slate-500"><bdi dir="ltr">{formatNumber(row.kwh)} kWh</bdi></span>
                    <strong className={"w-11 text-left text-sm font-black " + row.text}><bdi dir="ltr">{row.pct}%</bdi></strong>
                  </span>
                </li>
              ))}
            </ul>
            {gridToBatteryKWh >= 0.5 && (
              <p className="mt-2.5 text-[11px] font-semibold leading-5 text-slate-500">
                شُحنت البطارية من الشبكة أيضاً (نحو <bdi dir="ltr">{formatNumber(gridToBatteryKWh)} kWh</bdi>)، لذلك ليست كل طاقة البطارية شمسية.
              </p>
            )}
          </section>

          {/* Totals for the period. */}
          <section className="desktop-wide grid grid-cols-2 gap-3">
            <StatTile card big tone="amber" label="إنتاج الألواح" value={formatNumber(data.totals.solarKWh)} unit="kWh" />
            <StatTile card big tone="sky" label="استهلاك المنزل" value={formatNumber(data.totals.homeKWh)} unit="kWh" />
          </section>

          {/* How the saving is worked out, for whoever wants the details; closed by default. */}
          <details className="group rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm font-black text-slate-950">
                <Calculator className="h-4 w-4 text-slate-500" aria-hidden="true" /> كيف حسبنا الوفر؟
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4 text-xs font-semibold leading-6 text-slate-600">
              <div>
                <h3 className="font-black text-slate-800">الفترة</h3>
                <p>
                  {data.range ? (data.range.from === data.range.to ? dayLabel(data.range.from) : `من ${dayLabel(data.range.from)} إلى ${dayLabel(data.range.to)}`) : ""}،
                  {" "}محسوبة من {daysCount(data.periodDays)} فيها قراءات.
                  {staleData && data.range?.lastDataDay && <span className="text-amber-700"> آخر يوم فيه قراءات: {dayLabel(data.range.lastDataDay)}.</span>}
                </p>
              </div>
              <div>
                <h3 className="font-black text-slate-800">التعرفة</h3>
                <p>
                  {formatMoney(tariff)} لكل كيلوواط ساعة من الشبكة، من إعداداتك
                  {exportTariff > 0 ? <>، و{formatMoney(exportTariff)} لكل كيلوواط ساعة تبيعه للشبكة</> : null}.
                </p>
              </div>
              <div>
                <h3 className="font-black text-slate-800">المعادلة</h3>
                <p>الوفر = تكلفة استهلاك البيت كلّه بسعر الشبكة − ما دفعته فعلاً للشبكة{exportIncome > 0 ? " + عائد البيع" : ""}.</p>
                <div className="mt-1.5 space-y-1 rounded-xl bg-slate-50 p-3 text-left font-bold text-slate-700" dir="ltr">
                  <div>{formatNumber(homeKWh)} kWh × {moneyText(currency, tariff)} = {moneyText(currency, hypotheticalCost)}</div>
                  <div>{formatNumber(data.totals.gridImportKWh)} kWh × {moneyText(currency, tariff)} = {moneyText(currency, gridCost)}</div>
                  {exportIncome > 0 && <div>{formatNumber(data.totals.gridExportKWh)} kWh × {moneyText(currency, exportTariff)} = {moneyText(currency, exportIncome)}</div>}
                  <div className="border-t border-slate-200 pt-1">
                    {moneyText(currency, hypotheticalCost)} − {moneyText(currency, gridCost)}{exportIncome > 0 ? ` + ${moneyText(currency, exportIncome)}` : ""} = {moneyText(currency, savedAmount)}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-black text-slate-800">الافتراضات والحدود</h3>
                <ul className="list-disc space-y-0.5 pr-4">
                  <li>لا يشمل ثمن المنظومة وتركيبها وصيانتها، ولا أي رسوم ثابتة في فاتورة الكهرباء.</li>
                  <li>الأيام التي لا قراءات فيها تُستبعد ولا تُعدّ استهلاكاً صفرياً.</li>
                  <li>الكهرباء التي شحنت البطارية من الشبكة محسوبة ضمن ما دفعته، مرة واحدة فقط.</li>
                </ul>
              </div>
            </div>
          </details>
        </>
      )}

      <details onToggle={(e) => { const open = e.currentTarget.open; setPrefsOpen(open); }} className="group rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
              <Settings2 className="h-4 w-4 text-slate-500" aria-hidden="true" /> سعر الكهرباء والعملة
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {tariff > 0 ? <>الآن: {formatMoney(tariff)} للكيلوواط ساعة</> : "لم يُحدَّد السعر بعد"}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600 group-open:bg-teal-50 group-open:text-teal-700">
            تعديل
          </span>
        </summary>

        <div className="space-y-3 border-t border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[11px] font-black text-slate-700">العملة</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass}>
                <option value="USD">دولار أمريكي ($)</option>
                <option value="SYP">ليرة سورية (ل.س)</option>
                {/* A currency saved elsewhere stays selectable instead of silently showing USD. */}
                {!["USD", "SYP"].includes(currency) && <option value={currency}>{currency}</option>}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-black text-slate-700">سعر الكيلوواط ساعة من الشبكة</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={tariff} onChange={(e) => setTariff(Number(e.target.value))} className={inputClass} />
            </label>

            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-[11px] font-black text-slate-700">سعر بيع الفائض للشبكة (لكل كيلوواط ساعة)</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={exportTariff} onChange={(e) => setExportTariff(Number(e.target.value))} className={inputClass} />
              <span className="block text-[11px] font-semibold leading-4 text-slate-500">اتركه 0 إن كنت لا تبيع الكهرباء للشبكة؛ لن يُحتسب أي عائد.</span>
            </label>
          </div>
        </div>
      </details>

      {saved && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-black text-emerald-700">
          ✓ تم حفظ التفضيلات بنجاح
        </div>
      )}

      {saveError && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-black text-rose-700">
          {saveError}
        </div>
      )}

      {/* The save button is only needed while a preferences panel is open. */}
      {(prefsOpen || saving) && <button
        type="button"
        onClick={handleSave}
        disabled={saving || !settingsLoaded}
        className="min-h-12 w-full rounded-2xl bg-teal-600 px-5 py-3 text-base font-black text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
      >
        {saving ? "جاري الحفظ…" : "حفظ التغييرات"}
      </button>}
    </div>
  );
}
