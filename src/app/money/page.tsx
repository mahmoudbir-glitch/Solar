"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { moneyTone, semanticBg, semanticBorder, semanticText } from "@/lib/energy";
import { AmpPill } from "@/components/amp-pill";
import { StatTile } from "@/components/stat-tile";
import { acAmpHours, percentsOf } from "@/lib/energy";

type Period = "day" | "week" | "month";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "يوم" },
  { key: "week", label: "أسبوع" },
  { key: "month", label: "شهر" },
];

type FinanceData = {
  period?: Period;
  periodDays: number;
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
  };
};

const sourceStyles = [
  {
    key: "solar",
    name: "الشمس مباشرة",
    short: "شمس",
    color: "bg-amber-400",
    soft: "bg-amber-50",
    text: "text-amber-700",
  },
  {
    key: "battery",
    name: "البطارية",
    short: "بطارية",
    color: "bg-emerald-500",
    soft: "bg-emerald-50",
    text: "text-emerald-700",
  },
  {
    key: "grid",
    name: "الشبكة",
    short: "شبكة",
    color: "bg-violet-500",
    soft: "bg-violet-50",
    text: "text-violet-700",
  },
] as const;

function formatNumber(value: number, digits = Math.abs(value) >= 100 ? 0 : 1) {
  return value.toLocaleString("ar-u-nu-latn", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "آخر يوم" / "آخر يومين" / "آخر 5 أيام" / "آخر 12 يوماً": Arabic plural for the period. */
function lastDays(n: number) {
  if (n === 1) return "آخر يوم";
  if (n === 2) return "آخر يومين";
  return `آخر ${n} ${n >= 3 && n <= 10 ? "أيام" : "يوماً"}`;
}

/** The badge for the chosen period: today, or the days that really have readings. */
function periodLabel(period: Period, days: number) {
  return period === "day" ? "اليوم" : lastDays(days);
}

/** Money with at most two decimals (0.325 -> 0.33), Latin digits. */
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 });

export default function MoneyDashboard() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [tariff, setTariff] = useState(0);
  const [exportTariff, setExportTariff] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
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
        setCurrency(String(settings.currency || "USD"));
        setSettingsLoaded(true);
      })
      .catch(() => undefined);
  }, []);

  // The figures follow the chosen period; a late answer for an older choice
  // must not replace the current one.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/finance?period=${period}`, { cache: "no-store" })
      .then(async (financeResponse) => {
        const next = financeResponse.ok ? ((await financeResponse.json()) as FinanceData) : null;
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  // What the house used, priced at the grid tariff: the bill without the system.
  const hypotheticalCost = data
    ? (data.sources.solarKWh + data.sources.batteryKWh + data.sources.gridKWh) * tariff
    : 0;
  const gridCost = data ? data.totals.gridImportKWh * tariff : 0;
  const exportIncome = data ? data.totals.gridExportKWh * exportTariff : 0;
  // Saving = the bill without the system − what was really paid + export income.
  // Pricing the battery's share as saved counted grid energy twice whenever the
  // grid charged the battery (paid once on import, "saved" again on discharge).
  const savedAmount = useMemo(() => hypotheticalCost - gridCost + exportIncome, [hypotheticalCost, gridCost, exportIncome]);
  const savedTone = moneyTone(savedAmount);

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

  return (
    <div className="desktop-grid w-full space-y-3 pb-4 text-right" dir="rtl">
      <PageHeader icon={Coins} tone="teal" eyebrow="Solar • المال" title="التحليل المالي ومصادر الكهرباء" subtitle={data?.periodDays ? `مصادر الكهرباء والوفر خلال ${periodLabel(period, data.periodDays)}.` : "مصادر الكهرباء والوفر من قراءات منظومتك."} />

      <div role="tablist" aria-label="فترة التحليل" className="grid grid-cols-3 gap-2">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={period === item.key}
            onClick={() => setPeriod(item.key)}
            className={
              "min-h-11 rounded-2xl border text-sm font-black transition " +
              (period === item.key ? "border-teal-600 bg-teal-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600")
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <section className="desktop-wide rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="text-sm font-black text-slate-600">جاري تجهيز التحليل…</div>
        </section>
      ) : !data || !data.periodDays ? (
        <section className="desktop-wide rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">📊</div>
          <h2 className="mt-3 text-base font-black text-slate-900">{period === "day" ? "لا قراءات لليوم بعد" : "لا توجد بيانات كافية بعد"}</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {period === "day"
              ? "تظهر أرقام اليوم مع وصول أول قراءات منظومتك. جرّب الأسبوع أو الشهر."
              : "يُحسب الوفر ومصادر الكهرباء بعد تجمّع يوم كامل من القراءات، وستظهر هنا تلقائياً بدل الأصفار."}
          </p>
        </section>
      ) : (
        <>
          {/* Totals for the period; how the house was covered is in the sources card below. */}
          <section className="desktop-wide grid grid-cols-2 gap-3">
            <StatTile card big tone="amber" label="إنتاج الألواح" value={formatNumber(data.totals.solarKWh)} unit="kWh" ampTone="amber" ampUnit="Ah" amps={acAmpHours(data.totals.solarKWh)} />
            <StatTile card big tone="sky" label="استهلاك المنزل" value={formatNumber(data.totals.homeKWh)} unit="kWh" ampTone="sky" ampUnit="Ah" amps={acAmpHours(data.totals.homeKWh)} />
          </section>

          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-950">⚡ مصادر الكهرباء</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">كيف تم تغطية استهلاك المنزل؟</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                {periodLabel(period, data.periodDays)}
              </span>
            </div>

            <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
              {sourceRows.map((row) => (
                <div
                  key={row.key}
                  className={row.color}
                  style={{ width: String(Math.max(0, Math.min(100, row.pct))) + "%" }}
                  title={row.name}
                />
              ))}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {sourceRows.map((row) => (
                <div key={row.key} className={"rounded-xl p-3 " + row.soft}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={"h-2.5 w-2.5 rounded-full " + row.color} />
                      <span className={"text-xs font-black " + row.text}>{row.name}</span>
                    </div>
                    <strong className={"text-sm font-black " + row.text}>{row.pct}%</strong>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-slate-500"><bdi dir="ltr">{formatNumber(row.kwh)} kWh</bdi> <AmpPill tone={row.key === "solar" ? "amber" : row.key === "battery" ? "emerald" : "violet"} unit="Ah" amps={acAmpHours(row.kwh)} /></div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-950">💰 الصورة المالية</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">تقدير مبني على التعرفة المسجلة</p>
              </div>
            </div>

            {/* With no price saved every amount is zero, which reads like "no savings". */}
            {settingsLoaded && tariff <= 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-800">
                لم يُحدَّد سعر كهرباء الشبكة بعد، لذلك تظهر المبالغ صفراً. افتح «التفضيلات المالية» في الأسفل وأدخل سعر الكيلوواط ساعة.
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className={"col-span-2 rounded-2xl border p-4 " + semanticBorder[savedTone] + " " + semanticBg[savedTone]}>
                <span className={"text-[11px] font-bold " + semanticText[savedTone]}>الوفر التقديري</span>
                <strong className={"mt-1 block text-3xl font-black " + semanticText[savedTone]}>
                  <bdi dir="ltr">{currency} {money(savedAmount)}</bdi>
                </strong>
                <span className="mt-1 block text-[10px] font-semibold opacity-75">ما لم تدفعه للشبكة بفضل النظام</span>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3.5">
                <span className="text-[11px] font-bold text-violet-700">تكلفة الشبكة الفعلية</span>
                <strong className="mt-1 block text-lg font-black text-violet-800">
                  <bdi dir="ltr">{currency} {money(gridCost)}</bdi>
                </strong>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <bdi dir="ltr">{formatNumber(data.totals.gridImportKWh)} kWh</bdi>
                  <AmpPill tone="violet" unit="Ah" amps={acAmpHours(data.totals.gridImportKWh)} />
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="text-[11px] font-bold text-slate-600">بلا النظام الشمسي</span>
                <strong className="mt-1 block text-lg font-black text-violet-700">
                  <bdi dir="ltr">{currency} {money(hypotheticalCost)}</bdi>
                </strong>
                <span className="mt-1.5 block text-[10px] font-semibold text-slate-500">تكلفة افتراضية من الشبكة</span>
              </div>

              {data.totals.gridExportKWh > 0 && (
                <div className="col-span-2 rounded-2xl border border-amber-100 bg-amber-50/60 p-3.5">
                  <span className="text-[11px] font-bold text-amber-700">الفائض المصدّر</span>
                  <strong className="mt-1 flex flex-wrap items-center gap-2 text-lg font-black text-amber-800">
                    <bdi dir="ltr">{formatNumber(data.totals.gridExportKWh)} kWh</bdi>
                    <AmpPill tone="amber" unit="Ah" amps={acAmpHours(data.totals.gridExportKWh)} />
                  </strong>
                </div>
              )}
            </div>

            {tariff > 0 && (
              <p className="mt-3 rounded-xl bg-teal-50/60 px-3 py-2 text-[11px] font-bold leading-5 text-slate-600">
                الحساب: <bdi dir="ltr">{money(hypotheticalCost)}</bdi> بلا النظام − <bdi dir="ltr">{money(gridCost)}</bdi> دفعت للشبكة{exportIncome > 0 ? <> + <bdi dir="ltr">{money(exportIncome)}</bdi> من التصدير</> : null} = <bdi dir="ltr">{money(savedAmount)}</bdi> {currency}
              </p>
            )}

            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-semibold leading-5 text-slate-500">
              ملاحظة: الأرقام تقديرية وتعتمد على الطاقة المسجلة وتعرفة الشراء والتصدير التي تضبطها في الإعدادات.
            </p>
          </section>
        </>
      )}

      <details onToggle={(e) => { const open = e.currentTarget.open; setPrefsOpen(open); }} className="group rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="text-base font-black text-slate-950">⚙️ التفضيلات المالية</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">العملة وتعرفة الشبكة والتصدير</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600 group-open:bg-teal-50 group-open:text-teal-700">
            تعديل
          </span>
        </summary>

        <div className="space-y-3 border-t border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-[11px] font-black text-slate-700">العملة</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass}>
                <option value="USD">دولار أمريكي ($)</option>
                <option value="LBP">ليرة لبنانية (LBP)</option>
                <option value="SYP">ليرة سورية (SYP)</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-black text-slate-700">سعر شراء الشبكة / kWh</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={tariff} onChange={(e) => setTariff(Number(e.target.value))} className={inputClass} />
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-black text-slate-700">سعر تصدير الفائض / kWh</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={exportTariff} onChange={(e) => setExportTariff(Number(e.target.value))} className={inputClass} />
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
