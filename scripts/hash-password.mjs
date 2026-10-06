import { randomBytes,scryptSync } from "node:crypto";
const password=process.argv[2];
if(!password){console.error('Usage: node scripts/hash-password.mjs "YOUR_PASSWORD"');process.exit(1);}
const salt=randomBytes(16).toString("hex");
console.log("scrypt:"+salt+":"+scryptSync(password,salt,32).toString("hex"));
