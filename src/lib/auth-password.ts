import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password:string,salt=randomBytes(16).toString("hex")){
  return "scrypt:"+salt+":"+scryptSync(password,salt,32).toString("hex");
}
export function verifyPassword(password:string,storedHash:string){
  const parts=storedHash.split(":");
  if(parts.length!==3||parts[0]!=="scrypt") return false;
  const [,salt,hex]=parts;
  if(!salt||!hex||!/^[0-9a-f]+$/i.test(hex)) return false;
  const actual=scryptSync(password,salt,32);
  const expected=Buffer.from(hex,"hex");
  return expected.length===actual.length && timingSafeEqual(actual,expected);
}
