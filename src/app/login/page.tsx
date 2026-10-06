import { Suspense } from "react";
import LoginForm from "@/components/login-form";
import { SolarMark } from "@/components/solar-mark";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "تسجيل الدخول | Solar",
  robots: { index: false, follow: false },
};

function LoginFormFallback() {
  return (
    <div className="w-full space-y-3" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div dir="rtl" className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      {/* geometric backdrop: a faint dot grid with a warm sun glow above and a cool glow below */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(181,163,147,0.16)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-10rem] h-80 w-80 -translate-x-1/2 rounded-full bg-amber-100/50 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-sky-100/50 blur-3xl" />

      <section className="relative w-full max-w-sm rounded-[2rem] border border-slate-200/70 bg-white/90 px-6 pb-6 pt-8 shadow-[0_24px_60px_rgba(82,55,38,0.10)] backdrop-blur-xl sm:px-8">
        <header className="flex flex-col items-center text-center">
          {/* logo: Solar's sun badge */}
          <SolarMark large />
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">Solar</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">الطاقة البديلة</p>
          <div className="mt-5 flex w-full items-center gap-3 text-[11px] font-bold text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            مراقبة أنظمة الطاقة الشمسية
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </header>

        <div className="mt-5">
          <Suspense fallback={<LoginFormFallback />}><LoginForm /></Suspense>
        </div>

        <footer className="mt-6 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          نظام إدارة الطاقة الخاص بك
        </footer>
      </section>
    </div>
  );
}
