import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { FROZEN_REASON, isFrozen, storeReading } from "@/lib/smartess-sync";
import { assertPublicEndpoint, fetchPublicEndpoint, PrivateEndpointError } from "@/lib/net-guard";
import { decryptSecret } from "@/lib/inverter-config-crypto";
import { patchConnectionExtras } from "@/lib/connection-extras";
import { authenticate, describeDessError, describeNoDevice, discoverDevices, pickDevice, readLastData } from "@/lib/dessmonitor";

// Login, discovery and up to three read actions against a slow server.
export const maxDuration = 60;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A cloud round trip needs more headroom than the Modbus read timeout, whose
// default is 1000ms. Using timeoutMs directly made healthy servers look dead.
const MIN_REMOTE_TIMEOUT_MS = 5000;
const remoteTimeout = (timeoutMs: number) => Math.max(MIN_REMOTE_TIMEOUT_MS, timeoutMs);

function configured() {
  return Boolean(process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL);
}

/**
 * The gateway expects `Authorization: Bearer <token>`. Solar stores a one-way
 * hash for verification plus a reversible copy, so a test works at any time and
 * not only in the few seconds after the token was rotated.
 */
function gatewayAuthHeader(cipher: string | null, incoming: string): Record<string, string> {
  if (cipher) {
    try {
      const token = decryptSecret(cipher);
      if (token) return { Authorization: "Bearer " + token };
    } catch (error) {
      console.error("[inverter] gateway_token_decrypt_failed", error);
    }
  }
  if (incoming) return { Authorization: incoming };
  if (process.env.SOLAR_GATEWAY_TOKEN) return { Authorization: "Bearer " + process.env.SOLAR_GATEWAY_TOKEN };
  return {};
}

export async function POST(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized", message: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  if (process.env.SOLAR_MOCK_INVERTER === "true") {
    return NextResponse.json({ ok: true, source: "mock", message: "وضع الاختبار التجريبي يعمل بنجاح — لا يوجد اتصال عتادي فعلي.", latencyMs: 12 });
  }
  if (!configured()) return NextResponse.json({ ok: false, error: "database_not_configured", message: "قاعدة البيانات غير مهيأة." }, { status: 503 });

  try {
    const incomingGatewayToken = request.headers.get("authorization") || "";
    const row = await prisma.inverterConnection.findFirst({ where: { isPrimary: true } }) ?? await prisma.inverterConnection.findUnique({ where: { id: "default" } });
    if (!row) return NextResponse.json({ ok: false, error: "inverter_not_configured", message: "لم تتم إضافة إنفرتر بعد." }, { status: 422 });

    if (row.connectionMode === "local" || (row.protocol === "Modbus RTU" && !row.gatewayUrl)) {
      return NextResponse.json({ ok: false, error: "serial_port_unavailable", message: "المنفذ التسلسلي غير متاح من السحابة. استخدم بوابة محلية على الجهاز المتصل بالإنفرتر." }, { status: 422 });
    }

    if (row.protocol === "Wi-Fi Datalogger") {
      const cloudUrl = process.env.SOLAR_DESSMONITOR_URL || undefined;
      const started = Date.now();

      // Credentials live in the encrypted extras blob alongside the MQTT/Cloud ones.
      let extras: Record<string, unknown> = {};
      try {
        const raw = row.inverterLinkCode ? decryptSecret(row.inverterLinkCode) : "";
        if (raw) extras = JSON.parse(raw);
      } catch (error) {
        console.error("[inverter] extras_decrypt_failed", error);
      }

      const username = typeof extras.cloudUsername === "string" ? extras.cloudUsername : "";
      const password = typeof extras.cloudPassword === "string" ? extras.cloudPassword : "";

      if (!username || !password) {
        const message =
          "أدخل اسم المستخدم وكلمة المرور لحساب SmartESS لقراءة بيانات الدنجل. بدونهما لا يمكن قراءة أي قيمة من الإنفرتر.";
        await prisma.inverterConnection
          .update({ where: { id: row.id }, data: { lastTestResult: "error", lastTestReason: message } })
          .catch(() => {});
        return NextResponse.json(
          { ok: false, source: "dessmonitor", error: "cloud_credentials_missing", message },
          { status: 422 },
        );
      }

      try {
        const auth = await authenticate(
          { username, password, companyKey: typeof extras.cloudApiKey === "string" ? extras.cloudApiKey : undefined, baseUrl: cloudUrl },
          remoteTimeout(row.timeoutMs),
        );

        // devcode/devaddr are not printed on the dongle, so they are discovered
        // from the account rather than asked of the user.
        const discovery = await discoverDevices(auth, cloudUrl, remoteTimeout(row.timeoutMs));
        const devices = discovery.devices;
        const wanted = (row.dataloggerPn || "").trim();
        const device = pickDevice(devices, wanted);

        if (!device) {
          const pns = discovery.collectors.map((entry) => String(entry.pn ?? "")).filter(Boolean).join("، ") || "لا يوجد";
          // Several devices and none is the saved one: never guess, ask the owner.
          const message = devices.length
            ? describeNoDevice(devices, wanted)
            : `تم تسجيل الدخول إلى SmartESS، لكن لم نجد جهازاً قابلاً للقراءة. جوامع البيانات في الحساب: ${pns}. المحاولات: ${discovery.attempts.join(" | ")}`;
          await prisma.inverterConnection
            .update({ where: { id: row.id }, data: { lastStatus: "error", lastTestResult: "error", lastTestReason: message } })
            .catch(() => {});
          return NextResponse.json({ ok: false, source: "dessmonitor", error: devices.length ? "device_not_selected" : "no_devices", message }, { status: 502 });
        }

        // status 1 = Offline in SmartESS: the login worked but the datalogger is
        // not uploading, so reporting "connected" would be misleading.
        if (Number(device.status) === 1) {
          const message = "تم تسجيل الدخول إلى SmartESS، لكن الدنجل غير متصل بالإنترنت (Offline) فلا توجد قراءات. اربطه بواي فاي 2.4GHz من تطبيق SmartESS (إعداد الشبكة) ثم أعد الاختبار.";
          await prisma.inverterConnection
            .update({ where: { id: row.id }, data: { lastStatus: "error", lastTestResult: "error", lastTestReason: message } })
            .catch(() => {});
          return NextResponse.json({ ok: false, source: "dessmonitor", error: "device_offline", message }, { status: 502 });
        }

        const target = {
          pn: String(device.pn ?? wanted),
          devcode: Number(device.devcode ?? 0),
          devaddr: Number(device.devaddr ?? 1),
          sn: String(device.sn ?? row.dataloggerDeviceIdentifier ?? ""),
        };
        const reading = await readLastData(auth, target, cloudUrl, remoteTimeout(row.timeoutMs));

        // Remember what worked — the accepted user-name spelling, the login and
        // the device — so the background sync makes one read call instead of
        // repeating login and discovery against a slow server.
        const acceptedUser = auth.usr || username;
        // Patched onto what is stored now: the test can take a while, and the
        // credentials may have been saved again in the meantime.
        await patchConnectionExtras(row.id, { username, password }, (stored) => {
          delete stored.authFailedAt;
          Object.assign(stored, { cloudUsername: acceptedUser, dessAuth: { username: acceptedUser, auth }, dessDevice: target });
        }).catch((error) => console.error("[inverter] remember_device_failed", error));

        const latencyMs = Date.now() - started;
        // A login and a device are not a working connection: SmartESS keeps
        // answering with its last values after the dongle stops uploading. The
        // test only passes on a reading that is complete and still changing.
        const notLive = async (error: string, message: string) => {
          await prisma.inverterConnection
            .update({ where: { id: row.id }, data: { lastStatus: "error", lastTestResult: "error", lastTestLatencyMs: latencyMs, lastTestReason: message } })
            .catch(() => {});
          return NextResponse.json({ ok: false, source: "dessmonitor", error, message, latencyMs, parameters: reading.parameters }, { status: 502 });
        };
        if (await isFrozen(reading).catch(() => false)) return await notLive("telemetry_frozen", FROZEN_REASON);

        // Store what the test just read so the dashboard shows it straight away.
        let storeCrashed = false;
        const stored = await storeReading(reading, device).catch((error) => {
          storeCrashed = true;
          console.error("[inverter] store_reading_failed", error);
          return { ok: false as const, reason: "تعذر حفظ القراءة." };
        });
        // Missing values come from SmartESS; a database error does not.
        if (!stored.ok && !storeCrashed) return await notLive("telemetry_incomplete", stored.reason);
        const mapped = Object.entries(reading)
          .filter(([key, value]) => key !== "parameters" && key !== "raw" && value !== undefined)
          .map(([key]) => key);

        await prisma.inverterConnection.update({
          where: { id: row.id },
          data: {
            lastStatus: "connected",
            lastSeenAt: new Date(),
            lastTestResult: "success",
            lastTestLatencyMs: latencyMs,
            lastTestReason: null,
            dataloggerPn: String(device.pn ?? row.dataloggerPn ?? "") || row.dataloggerPn,
            dataloggerDeviceIdentifier: String(device.sn ?? row.dataloggerDeviceIdentifier ?? "") || row.dataloggerDeviceIdentifier,
          },
        });

        return NextResponse.json({
          ok: true,
          source: "dessmonitor",
          latencyMs,
          message: `تم تسجيل الدخول إلى SmartESS وقراءة ${Object.keys(reading.parameters).length} قيمة من الجهاز.`,
          device: { pn: device.pn, devcode: device.devcode, devaddr: device.devaddr, sn: device.sn },
          stored: stored.ok,
          storeProblem: stored.ok ? undefined : stored.reason,
          mappedFields: mapped,
          // Every parameter the cloud returned, so a label this build does not
          // recognise can be identified instead of silently dropped.
          parameters: reading.parameters,
        });
      } catch (error) {
        // For a rejected password, say exactly what was sent (never the password
        // itself) so a stored value that differs from what was typed is visible.
        const sent = error instanceof Error && /PASSWORD/i.test(error.message)
          ? ` (الاسم المُرسل: «${username}» وجُرّبت كتاباته الأخرى بالأحرف الكبيرة والصغيرة — عدد أحرف كلمة المرور المحفوظة: ${password.length})`
          : "";
        const message = describeDessError(error) + sent;
        console.error("[inverter] dessmonitor_test_failed", error);
        await prisma.inverterConnection
          .update({ where: { id: row.id }, data: { lastStatus: "error", lastTestResult: "error", lastTestReason: message } })
          .catch(() => {});
        return NextResponse.json(
          { ok: false, source: "dessmonitor", error: "dessmonitor_failed", message },
          { status: 502 },
        );
      }
    }

    const gatewayUrl = row.gatewayUrl || process.env.SOLAR_GATEWAY_URL || "";
    if (!gatewayUrl) return NextResponse.json({ ok: false, error: "gateway_not_configured", message: "لم يتم ضبط عنوان بوابة البيانات." }, { status: 422 });

    let safeGateway: string;
    try { safeGateway = await assertPublicEndpoint(gatewayUrl); }
    catch (error) {
      const message = error instanceof PrivateEndpointError
        ? "بوابة البيانات تستخدم عنواناً محلياً لا يمكن الوصول إليه من Vercel. انشر البوابة عبر HTTPS أو استخدم نفقاً آمناً."
        : "عنوان بوابة البيانات غير صالح.";
      await prisma.inverterConnection.update({ where: { id: row.id }, data: { lastTestResult: "error", lastTestReason: message } });
      return NextResponse.json({ ok: false, error: "invalid_gateway", message }, { status: 422 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remoteTimeout(row.timeoutMs));
    const started = Date.now();
    try {
      const response = await fetchPublicEndpoint(safeGateway + "/v1/inverter/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...gatewayAuthHeader(row.gatewayTokenCipher, incomingGatewayToken) },
        body: JSON.stringify({
          enabled: row.enabled,
          protocol: row.protocol === "Modbus TCP" ? "modbus-tcp" : row.protocol === "Wi-Fi Datalogger" ? "wifi-gateway" : "modbus-rtu",
          manufacturer: row.manufacturer || "Next Power", model: row.inverterModel || "NEXT - Victor Max 8.2KW",
          address: row.inverterAddress || "", port: row.port, serialPort: row.serialPort || "",
          baudRate: row.baudRate, dataBits: row.dataBits, stopBits: row.stopBits, parity: row.parity,
          slaveId: row.slaveId, timeoutMs: row.timeoutMs,
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      const data = body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown>
        : { message: "استجابة البوابة غير صالحة." };
      const latencyMs = Date.now() - started;
      if (!response.ok || data.ok !== true) {
        await prisma.inverterConnection.update({ where: { id: row.id }, data: { lastStatus: "error", lastTestResult: "error", lastTestLatencyMs: latencyMs, lastTestReason: typeof data.message === "string" ? data.message : "gateway_error" } });
        return NextResponse.json({ ok: false, source: "gateway", latencyMs, ...data }, { status: 502 });
      }
      await prisma.inverterConnection.update({ where: { id: row.id }, data: { lastStatus: "connected", lastSeenAt: new Date(), lastTestResult: "success", lastTestLatencyMs: latencyMs, lastTestReason: null } });
      return NextResponse.json({ ...data, ok: true, source: "gateway", latencyMs });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "انتهت مهلة اختبار الاتصال. تحقق من البوابة والإنفرتر." : error instanceof Error ? error.message : "تعذر اختبار الاتصال.";
    return NextResponse.json({ ok: false, source: "gateway", error: "gateway_connection_failed", message }, { status: 502 });
  }
}
