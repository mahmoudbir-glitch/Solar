import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MONITORING_ACTIONS } from "@/lib/monitoring";

/**
 * Failed sign-ins are counted in the database, not only in memory: on Vercel
 * every server instance has its own memory and loses it on restart, so an
 * in-memory counter alone never really reached its limit.
 */
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

/** Opaque tag for the caller's address; the IP address itself is never stored. */
export function clientTag(address: string) {
  return createHmac("sha256", process.env.AUTH_SECRET || process.env.SOLAR_AUTH_SECRET || "").update(`login-client:${address}`).digest("hex").slice(0, 16);
}

/** Stored at the end of a LOGIN_FAILED event's details. */
export const clientDetail = (tag: string) => `client=${tag}`;

/**
 * True when this client has used up the failed attempts for the current
 * window. Avoid a global limit: distributed failures must not lock everyone
 * out of the application.
 */
export async function tooManyFailedLogins(tag: string) {
  try {
    const where = { action: MONITORING_ACTIONS.LOGIN_FAILED, timestamp: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) } };
    const mine = await prisma.monitoringEvent.count({ where: { ...where, details: { endsWith: clientDetail(tag) } } });
    return mine >= MAX_ATTEMPTS;
  } catch (error) {
    console.error("[auth] failed_login_count_unavailable", error);
    return false;
  }
}
