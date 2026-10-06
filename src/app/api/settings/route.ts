import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { checkAgainstInverter, getInverterLimits } from "@/lib/inverter-limits";
import { canManage, OWNER_ONLY_MESSAGE } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// إصلاح: كانت \\d داخل regex literal تعني "شرطة مائلة + d" فترفض أي وقت صحيح مثل 08:30
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A home array is at most tens of kW. A value above 100 kW means watts were
 * typed into the kW field (6000 -> 6,000,000 W), which made the forecast
 * promise 21,000 kWh a day; read it back as kW instead.
 */
const MAX_PANEL_W = 100_000;
const normalizePanelW = (w: number) => (w > MAX_PANEL_W ? w / 1000 : w);

const settingsSchema = z.object({
  panelPowerW: z.number().finite().positive().transform(normalizePanelW).refine((w) => w <= MAX_PANEL_W, "قدرة الألواح يجب ألا تتجاوز 100 كيلوواط.").optional(),
  batteryCapacityWh: z.number().finite().positive().optional(),
  gridTariff: z.number().finite().nonnegative().optional(),
  exportTariff: z.number().finite().nonnegative().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  // A typo ("Beirut") would break every chart and the forecast, so only real
  // IANA zones ("Asia/Beirut") are accepted.
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, "المنطقة الزمنية غير صحيحة. اكتبها بالشكل Asia/Beirut.")
    .optional(),
  panelTilt: z.number().finite().min(0).max(90).nullable().optional(),
  panelAzimuth: z.number().finite().min(0).max(360).nullable().optional(),
  batteryNominalVoltage: z.number().int().refine((v) => [12, 24, 48].includes(v), "جهد البطارية يجب أن يكون 12 أو 24 أو 48 فولت.").optional(),
  batteryChemistry: z.enum(["LiFePO4", "Lithium-ion", "Lead-acid", "Gel", "AGM"]).nullable().optional(),
  batteryMinReservePct: z.number().finite().min(0).max(100).optional(),
  bulkChargeVoltage: z.number().finite().min(15).max(70).nullable().optional(),
  floatChargeVoltage: z.number().finite().min(15).max(70).nullable().optional(),
  lowDcCutoffVoltage: z.number().finite().min(10).max(70).nullable().optional(),
  backToGridVoltage: z.number().finite().min(10).max(70).nullable().optional(),
  maxChargeCurrentA: z.number().finite().positive().max(300).nullable().optional(),
  // The inverter offers three output priorities (SmartESS: Utility first /
  // Solar first / SBU first). "UTI" was missing, so an installation actually
  // set to Utility first — as this one is — could not be represented at all.
  outputSourcePriority: z.enum(["SBU", "SUB", "UTI"]).optional(),
  chargerSourcePriority: z.enum(["CSO", "SNU"]).optional(),
  batteryMaxChargeA: z.number().finite().positive().nullable().optional(),
  batteryMaxDischargeA: z.number().finite().positive().nullable().optional(),
  inverterRatedPowerKw: z.number().finite().positive().nullable().optional(),
  gridPhase: z.enum(["single", "three"]).optional(),
  gridType: z.enum(["on-grid", "off-grid", "hybrid"]).optional(),
  retentionDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365), z.literal(0)]).optional(),
  pollIntervalSec: z.union([z.literal(5), z.literal(10), z.literal(30), z.literal(60)]).optional(),
  lowBatteryPct: z.number().finite().min(5).max(50).optional(),
  criticalBatteryPct: z.number().finite().min(5).max(30).optional(),
  gridOutageAlert: z.boolean().optional(),
  faultAlert: z.boolean().optional(),
  offlineMinutes: z.number().int().min(2).max(120).optional(),
  overloadPct: z.number().finite().min(50).max(100).optional(),
  channels: z.enum(["in_app", "email"]).optional(),
  quietHoursStart: z.string().regex(TIME_HHMM).nullable().optional(),
  quietHoursEnd: z.string().regex(TIME_HHMM).nullable().optional(),
});

type Merged = {
  batteryNominalVoltage?: number | null;
  batteryChemistry?: string | null;
  bulkChargeVoltage?: number | null;
  floatChargeVoltage?: number | null;
  lowDcCutoffVoltage?: number | null;
  backToGridVoltage?: number | null;
  lowBatteryPct?: number | null;
  criticalBatteryPct?: number | null;
};

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL);
}

function fail(error: string, message: string) {
  return NextResponse.json({ error, message }, { status: 422 });
}

// التحقق على القيم "بعد الدمج" مع المخزنة، لأن الطلب قد يحتوي حقلاً واحداً فقط
function validateMerged(m: Merged) {
  const { lowDcCutoffVoltage: low, backToGridVoltage: back, floatChargeVoltage: float, bulkChargeVoltage: bulk } = m;
  const nominal = m.batteryNominalVoltage;

  if (low != null && back != null && low >= back) {
    return fail("invalid_voltage_thresholds", "Low DC Cut-off يجب أن يكون أقل من Back to Grid لتجنب التعارض بين الفصل والعودة إلى الشبكة.");
  }
  if (float != null && bulk != null && float >= bulk) {
    return fail("invalid_charge_voltages", "Float يجب أن يكون أقل من Bulk / CV.");
  }
  if (nominal && low != null && low > nominal * 1.35) {
    return fail("invalid_cutoff_voltage", "قيمة Low DC Cut-off لا تبدو مناسبة لجهد البطارية الاسمي المحدد.");
  }
  if (m.criticalBatteryPct != null && m.lowBatteryPct != null && m.criticalBatteryPct > m.lowBatteryPct) {
    return fail("invalid_battery_thresholds", "حد البطارية الحرجة يجب ألا يتجاوز حد البطارية المنخفضة.");
  }
  // حماية خلايا LiFePO4: 3.65V كحد أعلى و2.5V كحد أدنى لكل خلية (16 خلية = 48V)
  if (nominal && m.batteryChemistry === "LiFePO4") {
    const maxV = (nominal / 12) * 14.6;
    const minV = (nominal / 12) * 10;
    if (bulk != null && bulk > maxV) {
      return fail("invalid_bulk_for_lifepo4", `Bulk للبطارية LiFePO4 ${nominal}V يجب ألا يتجاوز ${maxV.toFixed(1)}V.`);
    }
    if (low != null && low < minV) {
      return fail("invalid_cutoff_for_lifepo4", `Low DC Cut-off للبطارية LiFePO4 ${nominal}V يجب ألا يقل عن ${minV.toFixed(1)}V.`);
    }
  }
  return null;
}

async function getSession(request: NextRequest) {
  return verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
}

async function writeAudit(username: string, action: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  try {
    const user = await prisma.user.findUnique({ where: { email: username } });
    if (!user) {
      // الدخول عبر SOLAR_USER من env لا يملك سجلاً في جدول users، فلا يُسجَّل التدقيق
      console.warn("[settings] audit_skipped_no_user_record");
      return;
    }
    const sensitive = new Set(["password", "passwordHash", "gatewayTokenHash", "wifiPasswordCipher"]);
    const clean = (value: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(value).filter(([key]) => !sensitive.has(key)));
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action,
        details: JSON.stringify({ before: clean(before), after: clean(after) }).slice(0, 8000),
      },
    });
  } catch (error) {
    console.error("[settings] audit_write_failed", error);
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasDatabase()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  try {
    const settings = await prisma.energySettings.upsert({
      where: { id: "default" },
      create: {
        panelPowerW: 6000,
        batteryCapacityWh: 4800,
        batteryNominalVoltage: 48,
        batteryChemistry: "LiFePO4",
        batteryMinReservePct: 20,
        inverterRatedPowerKw: 8.2,
      },
      update: {},
    });
    if (settings.panelPowerW > MAX_PANEL_W) {
      const fixed = normalizePanelW(settings.panelPowerW);
      await prisma.energySettings.update({ where: { id: "default" }, data: { panelPowerW: fixed } }).catch(() => {});
      settings.panelPowerW = fixed;
    }
    return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[settings] read_failed", error);
    return NextResponse.json({ error: "settings_read_failed" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canManage(session.username)) return NextResponse.json({ error: "forbidden", message: OWNER_ONLY_MESSAGE }, { status: 403 });
  if (!hasDatabase()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "البيانات المرسلة غير صالحة." }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: "invalid_settings", message: first?.message || "تحقق من القيم المدخلة.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const previous = await prisma.energySettings.upsert({ where: { id: "default" }, create: {}, update: {} });

    const invalid = validateMerged({ ...previous, ...parsed.data } as unknown as Merged);
    if (invalid) return invalid;

    // Generic bounds above keep the numbers sane; this keeps them within what
    // the installed inverter can actually honour, when its model is known.
    const primary =
      (await prisma.inverterConnection.findFirst({ where: { isPrimary: true } })) ??
      (await prisma.inverterConnection.findUnique({ where: { id: "default" } }));
    const limits = getInverterLimits(primary?.inverterModel);
    if (limits) {
      const merged = { ...previous, ...parsed.data } as Record<string, unknown>;
      const violation = checkAgainstInverter(limits, merged);
      if (violation) {
        return NextResponse.json(violation, { status: 422 });
      }
    }

    const settings = await prisma.energySettings.update({
      where: { id: "default" },
      data: parsed.data,
    });
    await writeAudit(session.username, "SETTINGS_SAVED", previous as unknown as Record<string, unknown>, settings as unknown as Record<string, unknown>);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[settings] write_failed", error);
    return NextResponse.json({ error: "settings_write_failed", message: "تعذر حفظ الإعدادات. لم تُحذف القيم السابقة." }, { status: 503 });
  }
}
