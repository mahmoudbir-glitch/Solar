import { getAuthConfig } from "@/lib/auth-config";

const COOKIE_NAME = "solar_session";
const LOGOUT_MARKER_COOKIE = "solar_logged_out";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function getSessionSecret() {
  // Sessions are signed with AUTH_SECRET only; never fall back to the password.
  return process.env.AUTH_SECRET || process.env.SOLAR_AUTH_SECRET || "";
}
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  let binary = "";
  for (const byte of sig) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  const aa = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  let diff = 0;
  for (let i=0;i<aa.length;i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
export type SessionPayload = { sub:string; username:string; exp:number; v:string };

/**
 * Ties a session to the account's current credentials. Changing the account's
 * password, or SOLAR_SESSION_EPOCH (to sign every device out at once), changes
 * this value, so sessions issued before the change stop working instead of
 * staying valid for the rest of their 7 days. Empty when the user name is no
 * longer a configured account.
 */
async function credentialVersion(username:string, secret:string) {
  const config=getAuthConfig();
  const credentials:string[]=[];
  if(config.username&&username===config.username) credentials.push(config.password||config.passwordHash);
  if(config.ownerUsername&&config.ownerPassword&&username===config.ownerUsername) credentials.push(config.ownerPassword);
  if(!credentials.length) return "";
  return (await sign(["v1",username,...credentials,process.env.SOLAR_SESSION_EPOCH||""].join("\u0000"),secret)).slice(0,22);
}

export async function createSessionToken(username:string) {
  const secret=getSessionSecret();
  if(!secret) throw new Error("AUTH_SECRET is not configured");
  const v=await credentialVersion(username,secret);
  if(!v) throw new Error("unknown_account");
  const payload={sub:username,username,exp:Math.floor(Date.now()/1000)+SESSION_TTL_SECONDS,v};
  const encoded=b64(JSON.stringify(payload));
  return encoded+"."+await sign(encoded,secret);
}
export async function verifySessionToken(token:string|null|undefined):Promise<SessionPayload|null>{
  const secret=getSessionSecret();
  if(!secret||!token) return null;
  const i=token.lastIndexOf(".");
  if(i<=0) return null;
  try{
    const encoded=token.slice(0,i);
    if(!(await safeEqual(token.slice(i+1),await sign(encoded,secret)))) return null;
    const payload=JSON.parse(unb64(encoded)) as SessionPayload;
    if(!payload.username||!payload.sub||typeof payload.exp!=="number"||payload.exp<=Math.floor(Date.now()/1000)) return null;
    // Issued before the password (or the session epoch) last changed.
    const current=await credentialVersion(payload.username,secret);
    if(!current||typeof payload.v!=="string"||!(await safeEqual(payload.v,current))) return null;
    return payload;
  }catch{return null;}
}
export function sessionCookie(token:string){
  return {name:COOKIE_NAME,value:token,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",maxAge:SESSION_TTL_SECONDS};
}
export function clearSessionCookie(){
  return {name:COOKIE_NAME,value:"",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",maxAge:0,expires:new Date(0)};
}
export function logoutMarkerCookie(){
  return {name:LOGOUT_MARKER_COOKIE,value:"1",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",maxAge:60*60*24*30};
}
export function clearLogoutMarkerCookie(){
  return {name:LOGOUT_MARKER_COOKIE,value:"",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",maxAge:0,expires:new Date(0)};
}
export { COOKIE_NAME, LOGOUT_MARKER_COOKIE };
