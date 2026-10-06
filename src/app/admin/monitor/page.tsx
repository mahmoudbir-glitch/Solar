import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { isMonitoringOwner } from "@/lib/monitor-auth";
import { ensureMonitoringStorage } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  LOGIN_SUCCESS: "تسجيل دخول",
  LOGIN_FAILED: "محاولة دخول فاشلة",
  APP_OPEN: "فتح التطبيق",
  INVERTER_CONFIG_SAVED: "حفظ إعدادات الإنفرتر",
  CONNECTION_TEST: "اختبار الاتصال",
  CONNECTION_TEST_SUCCESS: "نجح اختبار الاتصال",
  CONNECTION_TEST_FAILED: "فشل اختبار الاتصال",
  TELEMETRY_RECEIVED: "وصول Telemetry",
};

function formatDate(date: Date | null) {
  if (!date) return "لا يوجد";
  return new Intl.DateTimeFormat("ar-LB-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Beirut",
  }).format(date);
}

function ageText(date: Date | null) {
  if (!date) return "لا توجد بيانات";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `منذ ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return `منذ ${hours} ساعة`;
}

export default async function MonitoringPage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session || !isMonitoringOwner(session.username)) {
    redirect("/");
  }

  await ensureMonitoringStorage();

  const [eventsResult, eventCountResult, inverterResult, telemetryResult] = await Promise.all([
    prisma.monitoringEvent.findMany({
      orderBy: { timestamp: "desc" },
      take: 30,
    }).catch((error) => {
      console.error("[monitoring] events_read_failed", error);
      return [];
    }),
    prisma.monitoringEvent.count().catch((error) => {
      console.error("[monitoring] event_count_failed", error);
      return 0;
    }),
    prisma.inverterConnection.findUnique({ where: { id: "default" } }).catch((error) => {
      console.error("[monitoring] inverter_read_failed", error);
      return null;
    }),
    prisma.telemetryLog.findFirst({ orderBy: { timestamp: "desc" } }).catch((error) => {
      console.error("[monitoring] telemetry_read_failed", error);
      return null;
    }),
  ]);

  const events = eventsResult;
  const eventCount = eventCountResult;
  const inverter = inverterResult;
  const telemetry = telemetryResult;

  const latestLogin = events.find((event) => event.action === "LOGIN_SUCCESS")?.timestamp ?? null;
  const latestAppOpen = events.find((event) => event.action === "APP_OPEN")?.timestamp ?? null;
  const latestConfig = events.find((event) => event.action === "INVERTER_CONFIG_SAVED")?.timestamp ?? null;
  const latestTest = events.find((event) =>
    event.action === "CONNECTION_TEST_SUCCESS" || event.action === "CONNECTION_TEST_FAILED"
  );

  const telemetryIsLive =
    Boolean(telemetry) &&
    Date.now() - telemetry!.timestamp.getTime() <= 10 * 60 * 1000 &&
    telemetry!.source.toLowerCase() !== "demo";

  const telemetryDelayed =
    Boolean(telemetry) &&
    !telemetryIsLive;

  return (
    <main className="w-full space-y-4 pb-28 text-right" dir="rtl">
      <section className="energy-card border-blue-100 p-4 sm:p-5">
        <p className="text-sm font-black text-blue-600">لوحة المراقبة الخاصة</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">مراقبة المنظومة</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
          هذه الصفحة تعرض نشاط التجربة وحالة البيانات الحقيقية دون تسجيل معلومات شخصية غير ضرورية.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="energy-card p-4">
          <p className="text-sm font-bold text-slate-500">حالة استخدام التطبيق</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-2xl">🟢</span>
            <div>
              <p className="font-black text-slate-950">تم استخدام التطبيق</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">آخر فتح: {ageText(latestAppOpen)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm font-bold text-slate-600">آخر دخول: {formatDate(latestLogin)}</p>
          <p className="mt-1 text-sm font-bold text-slate-600">عدد الأحداث المسجلة: {eventCount}</p>
        </div>

        <div className="energy-card p-4">
          <p className="text-sm font-bold text-slate-500">إعداد الإنفرتر</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-2xl">{inverter ? "🟡" : "⚪"}</span>
            <div>
              <p className="font-black text-slate-950">{inverter ? "تم إعداد الإنفرتر" : "لم يتم إعداد الإنفرتر"}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                آخر حفظ: {formatDate(latestConfig)}
              </p>
            </div>
          </div>
          {inverter && (
            <div className="mt-4 space-y-1 text-sm font-bold text-slate-600">
              <p>الشركة: {inverter.manufacturer || "غير محددة"}</p>
              <p>الموديل: {inverter.inverterModel}</p>
              <p>البروتوكول: {inverter.protocol}</p>
            </div>
          )}
        </div>
      </section>

      <section className="energy-card p-4 sm:p-5">
        <p className="text-sm font-bold text-slate-500">الاتصال الحقيقي</p>
        <div className="mt-3 flex items-start gap-3">
          <span className="text-3xl">{telemetryIsLive ? "🟢" : telemetryDelayed ? "🟡" : "🔴"}</span>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-950">
              {telemetryIsLive ? "المنظومة متصلة — LIVE" : telemetryDelayed ? "البيانات متأخرة" : "لا توجد Telemetry حقيقية"}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              آخر بيانات: {telemetry ? ageText(telemetry.timestamp) : "لا يوجد"}
            </p>
          </div>
        </div>

        {telemetry && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">☀️ إنتاج الشمس</p>
              <p className="mt-1 text-lg font-black text-slate-950">{(telemetry.pvPowerW / 1000).toFixed(2)} kW</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">🔋 البطارية</p>
              <p className="mt-1 text-lg font-black text-slate-950">{telemetry.batterySoc.toFixed(0)}%</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">🏠 الاستهلاك</p>
              <p className="mt-1 text-lg font-black text-slate-950">{(telemetry.loadPowerW / 1000).toFixed(2)} kW</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">المصدر</p>
              <p className="mt-1 text-lg font-black text-slate-950">{telemetry.source}</p>
            </div>
          </div>
        )}

        <p className="mt-4 text-sm font-bold text-slate-600">
          حالة قاعدة الاتصال: {inverter?.lastStatus || "لم يتم الإعداد"}
          {inverter?.lastSeenAt ? ` · آخر ظهور: ${ageText(inverter.lastSeenAt)}` : ""}
        </p>
      </section>

      <section className="energy-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-500">آخر اختبار اتصال</p>
            <p className="mt-1 font-black text-slate-950">
              {latestTest ? actionLabels[latestTest.action] || latestTest.action : "لم يتم الاختبار"}
            </p>
          </div>
          <span className="text-2xl">
            {latestTest?.action === "CONNECTION_TEST_SUCCESS" ? "🟢" : latestTest ? "🔴" : "⚪"}
          </span>
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          {latestTest ? formatDate(latestTest.timestamp) : "لا يوجد سجل"}
        </p>
      </section>

      <section className="energy-card p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-sm font-bold text-slate-500">سجل النشاط</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">آخر 30 حدثًا</h2>
        </div>

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {events.length === 0 ? (
            <p className="p-4 text-sm font-bold text-slate-500">لا توجد أحداث مسجلة بعد.</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-black text-slate-900">{actionLabels[event.action] || event.action}</p>
                  {event.details && <p className="mt-1 truncate text-xs font-semibold text-slate-500">{event.details}</p>}
                </div>
                <div className="shrink-0 text-left">
                  <p className="text-xs font-bold text-slate-500">{formatDate(event.timestamp)}</p>
                  <p className="mt-1 text-xs font-black">{event.success ? "✓ ناجح" : "✕ فشل"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
