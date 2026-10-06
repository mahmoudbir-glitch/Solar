import type { InverterConnection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/inverter-config-crypto";

/**
 * Solar keeps its SmartESS account in the project's environment
 * (SMARTESS_USERNAME / SMARTESS_PASSWORD / SMARTESS_PN). A connection that has
 * no account saved yet adopts it, so the inverter is read without anyone
 * retyping the password in the settings page. An account saved from the
 * settings page always wins.
 */
export function envCloudAccount() {
  const username = (process.env.SMARTESS_USERNAME || "").trim();
  const password = process.env.SMARTESS_PASSWORD || "";
  if (!username || !password || /^change-this/i.test(password)) return null;
  return { username, password, pn: (process.env.SMARTESS_PN || "").trim() };
}

const DEFAULT_DATALOGGER_PN = "Q0045395318912";

/** The installation this project monitors: NEXT Victor Max 8.2KW behind a Wi-Fi Plug Pro. */
export function defaultConnectionData(): Prisma.InverterConnectionCreateInput {
  const account = envCloudAccount();
  return {
    id: "default",
    systemName: "منظومة Solar",
    inverterModel: "NEXT - Victor Max 8.2KW",
    manufacturer: "Next Power",
    dataloggerPn: account?.pn || DEFAULT_DATALOGGER_PN,
    dataloggerType: "Wi-Fi Plug Pro RTU",
    dataloggerUpdateIntervalSec: 300,
    dataloggerCloud: "SmartESS / DESSMonitor",
    protocol: "Wi-Fi Datalogger",
    connectionMode: "gateway",
    enabled: true,
    isPrimary: true,
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "N",
    slaveId: 1,
    timeoutMs: 3000,
    pollingIntervalMs: 10000,
    lastStatus: "disconnected",
    lastTestReason: account ? "بانتظار أول قراءة من SmartESS." : "أدخل حساب SmartESS ثم اختبر الاتصال.",
    ...(account ? { inverterLinkCode: encryptSecret(JSON.stringify({ cloudUsername: account.username, cloudPassword: account.password })) } : {}),
  };
}

/** Saves the environment's SmartESS account on a connection that has none. Returns the row as stored. */
export async function adoptEnvCloudAccount(row: InverterConnection): Promise<InverterConnection> {
  const account = envCloudAccount();
  if (!account) return row;
  let extras: Record<string, unknown> = {};
  try {
    const raw = row.inverterLinkCode ? decryptSecret(row.inverterLinkCode) : "";
    if (raw) extras = JSON.parse(raw);
  } catch {
    return row;
  }
  if (extras.cloudUsername || extras.cloudPassword) return row;
  return prisma.inverterConnection.update({
    where: { id: row.id },
    data: {
      inverterLinkCode: encryptSecret(JSON.stringify({ ...extras, cloudUsername: account.username, cloudPassword: account.password })),
      ...(row.dataloggerPn ? {} : { dataloggerPn: account.pn || DEFAULT_DATALOGGER_PN }),
    },
  });
}
