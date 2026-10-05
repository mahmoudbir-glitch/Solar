import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const API='https://api.dessmonitor.com/public/';
const APP_CLIENT='web';
const APP_ID='solar';
const APP_VERSION='1.0.0';

function sha1(value:string){return createHash('sha1').update(value,'utf8').digest('hex');}

function makeUrl(action:string, params:Record<string,string>={}){
 const url=new URL(API);
 url.searchParams.set('salt',Date.now().toString());
 url.searchParams.set('action',action.replace(/^&/,''));
 for(const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
 return url;
}

async function authenticate(username:string,password:string,companyKey:string){
 const salt=Date.now().toString();
 const action=`&action=authSource&usr=${encodeURIComponent(username)}&company-key=${encodeURIComponent(companyKey)}&source=1&_app_client_=${APP_CLIENT}&_app_id_=${APP_ID}&_app_version_=${APP_VERSION}`;
 const sign=sha1(`${salt}${sha1(password)}${action}`);
 const url=new URL(API);
 url.searchParams.set('sign',sign);url.searchParams.set('salt',salt);url.searchParams.set('action','authSource');url.searchParams.set('usr',username);url.searchParams.set('company-key',companyKey);url.searchParams.set('source','1');url.searchParams.set('_app_client_',APP_CLIENT);url.searchParams.set('_app_id_',APP_ID);url.searchParams.set('_app_version_',APP_VERSION);
 const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data||Number(data.err)!==0) return {ok:false,data};
 return {ok:true,data};
}

async function callApi(token:string,secret:string,action:string,params:Record<string,string>){
 const salt=Date.now().toString();
 const tail=`&action=${action}${Object.entries({...params,source:'1',_app_client_:APP_CLIENT,_app_id_:APP_ID,_app_version_:APP_VERSION}).map(([key,value])=>`&${key}=${encodeURIComponent(value)}`).join('')}`;
 const sign=sha1(`${salt}${secret}${token}${tail}`);
 const url=new URL(API);
 url.searchParams.set('sign',sign);url.searchParams.set('salt',salt);url.searchParams.set('token',token);url.searchParams.set('action',action);
 for(const [key,value] of Object.entries({...params,source:'1',_app_client_:APP_CLIENT,_app_id_:APP_ID,_app_version_:APP_VERSION})) url.searchParams.set(key,value);
 const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
 const data=await response.json().catch(()=>null);
 return {ok:response.ok&&Number(data?.err)===0,data};
}

export async function POST(request:Request){
 const username=process.env.SMARTESS_USERNAME?.trim();
 const password=process.env.SMARTESS_PASSWORD;
 const companyKey=process.env.SMARTESS_COMPANY_KEY?.trim();
 const pn=(await request.json().catch(()=>({})) as {pn?:string}).pn?.trim()||process.env.SMARTESS_PN?.trim()||'Q0031256230580';
 if(!username||!password||!companyKey){
  return NextResponse.json({ok:false,message:'لم يتم إعداد بيانات SmartESS السرية على خادم Solar بعد. يلزم اسم المستخدم وكلمة المرور وCompany Key.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
 try{
  const auth=await authenticate(username,password,companyKey);
  if(!auth.ok) return NextResponse.json({ok:false,message:`فشل تسجيل الدخول إلى SmartESS${auth.data?.desc?`: ${auth.data.desc}`:''}`},{status:401,headers:{'Cache-Control':'no-store'}});
  const token=auth.data.dat.token as string;
  const secret=auth.data.dat.secret as string;
  const collector=await callApi(token,secret,'webQueryCollectorsEs',{page:'0',pagesize:'50',pn});
  if(!collector.ok) return NextResponse.json({ok:false,message:`تم تسجيل الدخول لكن لم يتم العثور على وحدة Wi-Fi Plug Pro ${pn}${collector.data?.desc?`: ${collector.data.desc}`:''}`},{status:404,headers:{'Cache-Control':'no-store'}});
  const item=Array.isArray(collector.data?.dat?.collector)?collector.data.dat.collector.find((entry:{pn?:string})=>entry.pn===pn):null;
  if(!item) return NextResponse.json({ok:false,message:`تم تسجيل الدخول، لكن وحدة Wi-Fi Plug Pro ${pn} غير ظاهرة في الحساب.`},{status:404,headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({ok:true,message:`SmartESS متصل ✓ وحدة Wi-Fi Plug Pro ${pn} موجودة في الحساب وحالتها ${Number(item.status)===1?'متصلة':'غير متصلة'}.`,collector:{pn:item.pn,method:item.method,model:item.descx,status:item.status,firmware:item.fireware,load:item.load,signal:item.signal}},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return NextResponse.json({ok:false,message:'تعذر الوصول إلى خادم SmartESS/DessMonitor حالياً.'},{status:502,headers:{'Cache-Control':'no-store'}});
 }
}
