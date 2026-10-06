import Link from "next/link";

export default function NotFound() {
  return (
    <div dir="rtl" className="energy-card mx-auto mt-6 max-w-md space-y-3 p-6 text-center">
      <div className="text-3xl" aria-hidden="true">🔎</div>
      <h1 className="text-lg font-black text-slate-900">الصفحة غير موجودة</h1>
      <p className="text-sm font-semibold text-slate-500">ربما تغيّر الرابط. عُد إلى الرئيسية وتابع من هناك.</p>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-black text-white">الرئيسية</Link>
    </div>
  );
}
