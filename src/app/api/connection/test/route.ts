import { NextRequest, NextResponse } from "next/server";
import { sanitizeConnection } from "@/lib/inverter-connection";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { MONITORING_ACTIONS, recordMonitoringEvent } from "@/lib/monitoring";
import { assertPublicEndpoint, fetchPublicEndpoint, PrivateEndpointError } from "@/lib/net-guard";

export const runtime = "nodejs";

async function probeHttp(endpoint: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetchPublicEndpoint(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json,text/plain,*/*" },
      maxResponseBytes: 0,
    });

    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ ok: false, message: "غير مصرح." }, { status: 401 });

  try {
    const body = await request.json();
    const config = sanitizeConnection(body);

    if (!config.enabled) {
      return NextResponse.json({ ok: false, message: "فعّل مصدر الطاقة أولًا، ثم أعد الاختبار." }, { status: 400 });
    }

    if (!config.protocol) {
      return NextResponse.json({ ok: false, message: "اختر بروتوكولًا معروفًا قبل اختبار الاتصال." }, { status: 400 });
    }

    const endpointValue = config.endpoint || config.gatewayUrl || config.address;
    if (!endpointValue) {
      return NextResponse.json({ ok: false, message: "أدخل عنوان الاتصال أو بوابة البيانات." }, { status: 400 });
    }

    let endpoint: string;
    try {
      endpoint = await assertPublicEndpoint(endpointValue);
    } catch (error) {
      const message = error instanceof PrivateEndpointError
        ? "لأمان الخادم لا يمكن اختبار عناوين الشبكات المحلية مباشرة من Vercel. استخدم بوابة عامة أو ESP32 لإرسال telemetry إلى Solar."
        : "أدخل عنوان HTTP/HTTPS صالحًا لبوابة البيانات.";
      return NextResponse.json({ ok: false, message }, { status: 422 });
    }

    await recordMonitoringEvent({
      action: MONITORING_ACTIONS.CONNECTION_TEST,
      username: session.username,
      details: `protocol=${config.protocol}`,
    });

    const result = await probeHttp(endpoint);

    if (!result.ok) {
      await recordMonitoringEvent({
        action: MONITORING_ACTIONS.CONNECTION_TEST_FAILED,
        username: session.username,
        success: false,
        details: `http_status=${result.status}`,
      });
      return NextResponse.json({
        ok: false,
        message: `وصل الطلب إلى العنوان لكن الاستجابة غير صالحة كقناة بيانات (HTTP ${result.status}).`,
      }, { status: 502 });
    }

    await recordMonitoringEvent({
      action: MONITORING_ACTIONS.CONNECTION_TEST_SUCCESS,
      username: session.username,
      details: `http_status=${result.status}`,
    });

    return NextResponse.json({
      ok: true,
      message: `تم الوصول إلى بوابة البيانات بنجاح (HTTP ${result.status}). هذا يثبت الوصول إلى الـ endpoint، وليس صحة كل سجلات الإنفرتر.`,
      httpStatus: result.status,
    });
  } catch (error) {
    await recordMonitoringEvent({
      action: MONITORING_ACTIONS.CONNECTION_TEST_FAILED,
      username: session.username,
      success: false,
      details: error instanceof Error ? error.message : "unknown_error",
    });
    const message = error instanceof Error && error.name === "AbortError"
      ? "انتهت مهلة اختبار الاتصال بعد 4.5 ثوانٍ."
      : "تعذر الوصول إلى عنوان الاتصال. تحقق من العنوان والمنفذ والبوابة.";

    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
