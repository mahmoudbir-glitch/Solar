import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const API='https://api.dessmonitor.com/public/';
const APP_CLIENT='web';
const APP_ID='solar';
const APP_VERSION='1.0.0';
const DEFAULT_PN='Q0045395318912';

function sha1(value:string){return createHash('sha1').update(value,'utf8').digest('hex');}

async function authenticate(username:string,password:string,companyKey:string){
 const salt=Date.now().toString();
 const action=`&action=authSource&usr=${encodeURIComponent(username)}&company-key=${encodeURIComponent(companyKey)}&source=1&_app_client_=${APP_CLIENT}&_app_id_=${APP_ID}&_app_version_=${APP_VERSION}`;
 const sign=sha1(`${salt}${sha1(password)}${action}`);
 const url=new URL(API);
 url.searchParams.set('sign',sign);url.searchParams.set('salt',salt);url.searchParams.set('action','authSource');url.searchParams.set('usr',username);url.searchParams.set('company-key',companyKey);url.searchParams.set('source','1');url.searchParams.set('_app_client_',APP_CLIENT);url.searchParams.set('_app_id_',APP_ID);url.searchParams.set('_app_version_',APP_VERSION);
 const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data||Number(data.err)!==0)return {ok:false,data};
 return {ok:true,data};
}

async function callApi(token:string,secret:string,action:string,params:Record<string,string>){
 const salt=Date.now().toString();
 const all={...params,source:'1',_app_client_:APP_CLIENT,_app_id_:APP_ID,_app_version_:APP_VERSION};
 const tail=`&action=${action}${Object.entries(all).map(([key,value])=>`&${key}=${encodeURIComponent(value)}`).join('')}`;
 const sign=sha1(`${salt}${secret}${token}${tail}`);
 const url=new URL(API);
 url.searchParams.set('sign',sign);url.searchParams.set('salt',salt);url.searchParams.set('token',token);url.searchParams.set('action',action);
 for(const [key,value] of Object.entries(all))url.searchParams.set(key,value);
 const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
 const data=await response.json().catch(()=>null);
 return {ok:response.ok&&Number(data?.err)===0,data};
}

function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});}

export async function POST(request:Request){
 const body=await request.json().catch(()=>({})) as {pn?:string;deviceId?:string};
 const username=process.env.SMARTESS_USERNAME?.trim();
 const password=process.env.SMARTESS_PASSWORD;
 const companyKey=process.env.SMARTESS_COMPANY_KEY?.trim();
 const pn=body.pn?.trim()||process.env.SMARTESS_PN?.trim()||DEFAULT_PN;
 const deviceId=body.deviceId?.trim()||process.env.SMARTESS_DEVICE_ID?.trim()||'';
 const missing:string[]=[];
 if(!username)missing.push('SMARTESS_USERNAME');
 if(!password)missing.push('SMARTESS_PASSWORD');
 if(!companyKey)missing.push('SMARTESS_COMPANY_KEY');
 if(missing.length)return json({ok:false,code:'MISSING_ENV',message:`بيانات SmartESS غير مكتملة على خادم Solar. المتغيرات الناقصة: ${missing.join('، ')}. أضفها في Vercel ثم أعد النشر.`},503);
 try{
  const auth=await authenticate(username!,password!,companyKey!);
  if(!auth.ok){
   const desc=typeof auth.data?.desc==='string'?auth.data.desc:'';
   return json({ok:false,code:'AUTH_FAILED',message:`فشل تسجيل الدخول إلى SmartESS. تحقق من اسم المستخدم وكلمة المرور وCompany Key${desc?` (${desc})`:''}.`},401);
  }
  const token=auth.data.dat?.token as string|undefined;
  const secret=auth.data.dat?.secret as string|undefined;
  if(!token||!secret)return json({ok:false,code:'AUTH_RESPONSE_INVALID',message:'SmartESS قبل تسجيل الدخول لكن لم يُرجع بيانات الجلسة المطلوبة.'},502);
  const collector=await callApi(token,secret,'webQueryCollectorsEs',{page:'0',pagesize:'50',pn});
  if(!collector.ok){
   const desc=typeof collector.data?.desc==='string'?collector.data.desc:'';
   return json({ok:false,code:'COLLECTOR_QUERY_FAILED',message:`تم تسجيل الدخول إلى SmartESS، لكن تعذر البحث عن Wi-Fi Plug Pro ${pn}${desc?`: ${desc}`:''}`},502);
  }
  const items=Array.isArray(collector.data?.dat?.collector)?collector.data.dat.collector:[];
  const item=items.find((entry:{pn?:string})=>entry.pn===pn);
  if(!item)return json({ok:false,code:'COLLECTOR_NOT_FOUND',message:`تم تسجيل الدخول بنجاح، لكن وحدة Wi-Fi Plug Pro بالرقم ${pn} غير ظاهرة في الحساب.`},404);
  const online=Number(item.status)===1;
  return json({ok:online,code:online?'CONNECTED':'COLLECTOR_OFFLINE',message:online?`تم الاتصال بالإنفرتر عبر SmartESS بنجاح ✓ وحدة Wi-Fi Plug Pro ${pn} متصلة.`:`تم تسجيل الدخول والعثور على وحدة Wi-Fi Plug Pro ${pn}، لكنها غير متصلة حالياً.`,deviceId:deviceId||null,collector:{pn:item.pn,method:item.method,model:item.descx,status:item.status,firmware:item.fireware,load:item.load,signal:item.signal}},online?200:503);
 }catch{return json({ok:false,code:'UPSTREAM_UNAVAILABLE',message:'تعذر الوصول إلى خادم SmartESS/DessMonitor حالياً. تحقق من الخدمة ثم أعد الاختبار.'},502);}
}
