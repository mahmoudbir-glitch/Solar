import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join,extname} from 'node:path';
const roots=['src'];
const files=[];
function walk(dir){for(const name of readdirSync(dir)){const p=join(dir,name);const s=statSync(p);if(s.isDirectory())walk(p);else if(['.ts','.tsx'].includes(extname(p)))files.push(p)}}
for(const root of roots)walk(root);
const errors=[];
for(const file of files){const text=readFileSync(file,'utf8');if(text.includes('console.log('))errors.push(file+': remove console.log before production');if(/<img\s/i.test(text))errors.push(file+': use next/image instead of <img>');}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('lint: passed '+files.length+' TypeScript source files');