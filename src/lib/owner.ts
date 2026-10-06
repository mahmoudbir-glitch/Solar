/**
 * The owner signs in with their own account (SOLAR_OWNER_USER /
 * SOLAR_OWNER_PASSWORD); everyone else shares the regular one. Owner-only
 * features stay hidden from everyone until that account is configured.
 */
export function isOwner(username: string | null | undefined) {
  const owner = (process.env.SOLAR_OWNER_USER || "").trim();
  return Boolean(owner && process.env.SOLAR_OWNER_PASSWORD && username === owner);
}

/**
 * Who may change or erase things (settings, inverter connections, the stored
 * history). Once the owner account is configured, only the owner; until then
 * the single shared account keeps managing the app, so nobody is locked out.
 */
export function canManage(username: string | null | undefined) {
  const owner = (process.env.SOLAR_OWNER_USER || "").trim();
  if (!owner || !process.env.SOLAR_OWNER_PASSWORD) return Boolean(username);
  return isOwner(username);
}

export const OWNER_ONLY_MESSAGE = "هذا الإجراء متاح لحساب المالك فقط.";
