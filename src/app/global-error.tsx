"use client";

/** Last-resort screen if the app shell itself fails; it replaces the root layout. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#eaeef8", color: "#181f3f" }}>
        <div style={{ maxWidth: 420, margin: "48px auto", padding: 24, background: "#fff", borderRadius: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>تعذّر تشغيل Solar</h1>
          <p style={{ fontSize: 14, color: "#687499", lineHeight: 1.7, margin: "0 0 16px" }}>بياناتك محفوظة. أعد المحاولة بعد لحظات.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#181f3f", color: "#fff", fontWeight: 900, fontSize: 14 }}>إعادة المحاولة</button>
        </div>
      </body>
    </html>
  );
}
