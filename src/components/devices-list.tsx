"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

type Device = {
  deviceId: string;
  device: string;
  browser: string;
  mobile: boolean;
  city: string | null;
  country: string | null;
  firstSeen: string;
  lastSeen: string;
  logins: number;
  opens: number;
  current: boolean;
};

/** "Sidon، لبنان": the city as Vercel reports it, the country name in Arabic. */
function placeOf(d: Device) {
  let country = d.country;
  try {
    if (country) country = new Intl.DisplayNames(["ar"], { type: "region" }).of(country) ?? country;
  } catch {
    // Older browsers: keep the two-letter code.
  }
  return [d.city, country].filter(Boolean).join("، ") || null;
}

function when(iso: string) {
  const date = new Date(iso);
  const tz = "Asia/Beirut";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat("ar-LB-u-nu-latn", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(date);
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86_400_000));
  if (day(date) === today) return `اليوم ${time}`;
  if (day(date) === yesterday) return `أمس ${time}`;
  return new Intl.DateTimeFormat("ar-LB-u-nu-latn", { timeZone: tz, day: "numeric", month: "short" }).format(date) + ` ${time}`;
}

/** Devices that used the account recently, newest first; this device is marked. */
export function DevicesList() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void fetch("/api/devices", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { devices: Device[] }) => {
        setDevices(data.devices);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-xs font-bold text-rose-700">تعذّر تحميل لائحة الأجهزة.</p>;
  if (!devices) return <p className="text-xs font-semibold text-slate-500">جاري التحميل…</p>;
  if (devices.length === 0) {
    return <p className="text-xs font-semibold leading-5 text-slate-500">لا توجد أجهزة مسجّلة بعد. يظهر كل جهاز هنا بعد تسجيل الدخول أو فتح التطبيق.</p>;
  }

  return (
    <div className="space-y-2">
      {devices.map((d) => {
        const Icon = d.mobile ? Smartphone : Monitor;
        return (
          <div key={d.deviceId} className={"flex items-start gap-3 rounded-2xl border p-3 " + (d.current ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white")}>
            <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + (d.current ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <strong className="text-sm font-black text-slate-900">{d.device}</strong>
                <span className="text-xs font-bold text-slate-500">· <bdi dir="ltr">{d.browser}</bdi></span>
                {d.current && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">هذا الجهاز</span>}
              </div>
              <p className="mt-0.5 text-xs font-semibold text-slate-600">آخر استخدام: {when(d.lastSeen)}{placeOf(d) ? <> · {placeOf(d)}</> : null}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">أول مرة: {when(d.firstSeen)} · دخول {d.logins} · فتح التطبيق {d.opens}</p>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] font-semibold leading-5 text-slate-400">آخر 90 يوماً. إذا رأيت جهازاً لا تعرفه، غيّر كلمة مرور Solar.</p>
    </div>
  );
}
