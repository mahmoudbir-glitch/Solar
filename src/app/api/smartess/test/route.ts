import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const API='https://api.dessmonitor.com/public/';
const APP_CLIENT='web';
const APP_ID='shamsak';
const APP_VERSION='1.2.0';
const SOURCE='1';
const DEFAULT_PN='Q0045395318912';
// Compatibility fallback copied from the working Shamsak SmartESS client.
// It is never returned to the browser.
const DEFAULT_COMPANY_KEY='bnrl_frRFjEz8Mkn';
const REQUEST_TIMEOUT_MS=15000;

function sha1(value:string){return createHash('sha1').update(value,'utf8').digest('hex');}

async function fetchJson(url:URL){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
 try{
  const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
  const data=await response.json().catch(()=>null);
  return {response,data};
 }finally{clearTimeout(timer);}
}

function actionString(action:string,params:Record<string,string|number|undefined>){
 let value=`&action=${action}`;
 for(const [key,item] of Object.entries(params))if(item!==undefined)value+=`&${key}=${encodeURIComponent(String(item))}`;
 return value;
}

async function apiCall(token:string|undefined,secret:string|undefined,action:string,params:Record<string,string|number|undefined>){
 const salt=Date.now().toString();
 const tail=actionString(action,{...params,source:SOURCE,_app_client_:APP_CLIENT,_app_id_:APP_ID,_app_version_:APP_VERSION});
 const sign=token&&secret?sha1(`${salt}${secret}${token}${tail}`):sha1(`${salt}${sha1(process.env.SMARTESS_PASSWORD||'')}${tail}`);
 const url=new URL(API);
 url.searchParams.set('sign',sign);url.searchParams.set('salt',salt);
 if(token)url.searchParams.set('token',token);
 for(const part of tail.slice(1).split('&')){const [key,...rest]=part.split('=');if(key)url.searchParams.set(key,decodeURIComponent(rest.join('=')));}
 const {response,data}=await fetchJson(url);
 return {ok:response.ok&&Number(data?.err)===0,data};
}

async function authenticate(username:string,password:string){
 const companyKey=process.env.SMARTESS_COMPANY_KEY?.trim()||DEFAULT_COMPANY_KEY;
 const salt=Date.now().toString();
 const tail=actionString('authSource',{usr:username,'company-key':companyKey,source:SOURCE,_app_client_:APP_CLIENT,_app_id_:APP_ID,_app_version_:APP_VERSION});
 const sign=sha1(`${salt}${sha1(password)}${tail}`);
 const url=new URL(API);
 url.searchParams.set('sign',sign);url.searchParams.set('salt',salt);url.searchParams.set('action','authSource');url.searchParams.set('usr',username);url.searchParams.set('company-key',companyKey);url.searchParams.set('source',SOURCE);url.searchParams.set('_app_client_',APP_CLIENT);url.searchParams.set('_app_id_',APP_ID);url.searchParams.set('_app_version_',APP_VERSION);
 const {response,data}=await fetchJson(url);
 if(!response.ok||!data||Number(data.err)!==0)return {ok:false,data};
 const token=typeof data.dat?.token==='string'?data.dat.token:'';
 const secret=typeof data.dat?.secret==='string'?data.dat.secret:'';
 if(!token||!secret)return {ok:false,data};
 return {ok:true,data,token,secret};
}

function collectDevices(node:unknown,out:Array<Record<string,unknown>>,depth=0){
 if(!node||typeof node!=='object'||depth>7)return;
 if(Array.isArray(node)){for(const child of node)collectDevices(child,out,depth+1);return;}
 const item=node as Record<string,unknown>;
 if(typeof item.sn==='string'&&item.sn&&item.devcode!==undefined){out.push(item);return;}
 for(const child of Object.values(item))collectDevices(child,out,depth+1);
}

async function readDevice(token:string,secret:string,device:{pn:string;devcode:number;devaddr:number;sn:string}){
 const result=await apiCall(token,secret,'queryDeviceLastData',{page:'0',pagesize:'100',i18n:'en_US',pn:device.pn,devcode:String(device.devcode),devaddr:String(device.devaddr),sn:device.sn});
 if(!result.ok)throw new Error(typeof result.data?.desc==='string'?result.data.desc:'تعذر قراءة بيانات الإنفرتر من SmartESS.');
 return result.data;
}

function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});}

export async function POST(request:Request){
 const body=await request.json().catch(()=>({})) as {pn?:string;deviceId?:string};
 const username=process.env.SMARTESS_USERNAME?.trim();
 const password=process.env.SMARTESS_PASSWORD;
 const pn=body.pn?.trim()||process.env.SMARTESS_PN?.trim()||DEFAULT_PN;
 const deviceId=body.deviceId?.trim()||process.env.SMARTESS_DEVICE_ID?.trim()||'';
 if(!username||!password)return json({ok:false,code:'MISSING_ENV',message:'يرجى إعداد اسم المستخدم وكلمة المرور لـ SmartESS في Vercel.'},503);
 try{
  const auth=await authenticate(username,password);
  if(!auth.ok)return json({ok:false,code:'AUTH_FAILED',message:'تعذر تسجيل الدخول إلى SmartESS باستخدام نفس طريقة الاتصال العاملة في شمسك.'},401);

  const collector=await apiCall(auth.token,auth.secret,'webQueryCollectorsEs',{page:'0',pagesize:'50',pn});
  if(!collector.ok)return json({ok:false,code:'COLLECTOR_QUERY_FAILED',message:'تم تسجيل الدخول إلى SmartESS لكن تعذر الوصول إلى وحدة Wi-Fi Plug Pro.'},502);
  const items=Array.isArray(collector.data?.dat?.collector)?collector.data.dat.collector:[];
  const item=items.find((entry:{pn?:string})=>entry.pn===pn);
  if(!item)return json({ok:false,code:'COLLECTOR_NOT_FOUND',message:'تم تسجيل الدخول لكن وحدة Wi-Fi Plug Pro غير موجودة بهذا الرقم.'},404);
  if(Number(item.status)===1)return json({ok:false,code:'COLLECTOR_OFFLINE',message:'وحدة Wi-Fi Plug Pro موجودة لكن حالتها Offline حالياً.'},503);

  const discovered:Array<Record<string,unknown>>=[];
  for(const action of ['webQueryDeviceEs','webQueryDevice','queryDevices']){
   const result=await apiCall(auth.token,auth.secret,action,{page:'0',pagesize:'50',pn});
   if(result.ok)collectDevices(result.data?.dat,discovered);
   if(discovered.length)break;
  }

  let reading:unknown=null;
  let device:null|{pn:string;devcode:number;devaddr:number;sn:string}=null;
  if(discovered.length){
   const candidate=discovered.find(entry=>String(entry.pn??'')===pn)||discovered[0];
   device={pn:String(candidate.pn||pn),devcode:Number(candidate.devcode||0),devaddr:Number(candidate.devaddr||1),sn:String(candidate.sn||'')};
   if(device.sn&&device.devcode)reading=await readDevice(auth.token!,auth.secret!,device);
  }

  return json({ok:true,code:'CONNECTED',source:'dessmonitor',message:reading?'تم الاتصال بالإنفرتر وقراءة البيانات عبر نفس آلية شمسك ✓':'تم الاتصال بـ SmartESS وWi-Fi Plug Pro بنجاح ✓',deviceId:deviceId||null,companyKeySource:process.env.SMARTESS_COMPANY_KEY?'vercel_env':'shamsak_compatibility',collector:{pn:item.pn,method:item.method,model:item.descx,status:item.status,firmware:item.fireware,load:item.load,signal:item.signal},device,reading},200);
 }catch(error){
  console.error('[SmartESS] request failed:',error instanceof Error?error.message:'unknown error');
  return json({ok:false,code:'UPSTREAM_UNAVAILABLE',message:error instanceof Error&&error.name==='AbortError'?'انتهت مهلة الاتصال بـ SmartESS.':'تعذر قراءة بيانات SmartESS حالياً. أعد المحاولة بعد قليل.'},502);
 }
}
