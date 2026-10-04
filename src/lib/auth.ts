const COOKIE_NAME = 'solar_session';
const SESSION_DAYS = 7;

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sign(value: string) {
  const secret = process.env.SOLAR_AUTH_SECRET;
  if (!secret) throw new Error('SOLAR_AUTH_SECRET is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

async function verifySignature(value: string, signature: string) {
  const expected = await sign(value);
  return expected === signature;
}

export async function createSessionValue() {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = expiresAt.toString();
  return `${payload}.${await sign(payload)}`;
}

export async function isValidSession(value?: string) {
  if (!value) return false;
  const [expiresAt, signature] = value.split('.');
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) < Date.now()) return false;
  try {
    return await verifySignature(expiresAt, signature);
  } catch {
    return false;
  }
}

export function getAuthCredentials() {
  return {
    username: process.env.SOLAR_AUTH_USERNAME ?? '',
    password: process.env.SOLAR_AUTH_PASSWORD ?? '',
    secret: process.env.SOLAR_AUTH_SECRET ?? '',
  };
}

export const AUTH_COOKIE = COOKIE_NAME;
