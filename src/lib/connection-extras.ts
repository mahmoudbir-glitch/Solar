import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/inverter-config-crypto";

/**
 * A connection's encrypted extras (SmartESS account, remembered login and
 * device) are one blob, and a sync works from a copy it read up to a minute
 * earlier. Writing that copy back would silently undo whatever the owner saved
 * meanwhile, such as a corrected password.
 *
 * So changes are applied to what is stored right now, under a row lock. If the
 * stored account is no longer the one the caller worked with, the change is
 * about an account that has been replaced and is dropped. Returns whether it
 * was written.
 */
export async function patchConnectionExtras(
  id: string,
  used: { username: string; password: string },
  change: (stored: Record<string, unknown>) => void,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "InverterConnection" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.inverterConnection.findUnique({ where: { id }, select: { inverterLinkCode: true } });
    if (!row) return false;
    const raw = row.inverterLinkCode ? decryptSecret(row.inverterLinkCode) : "";
    const stored: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    if (stored.cloudUsername !== used.username || stored.cloudPassword !== used.password) return false;
    change(stored);
    await tx.inverterConnection.update({ where: { id }, data: { inverterLinkCode: encryptSecret(JSON.stringify(stored)) } });
    return true;
  });
}
