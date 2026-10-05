import {NextResponse} from 'next/server';

export async function POST(request:Request){
 const gateway=process.env.GATEWAY_URL;
 if(!gateway) return NextResponse.json({ok:false,message:'لم يتم إعداد عنوان البوابة المحلية في الخادم.'},{status:503});
 try{
  const body=await request.json();
  const response=await fetch(gateway.replace(/\/$/,'')+'/api/connection/test',{
   method:'POST',
   headers:{'Content-Type':'application/json','x-gateway-token':process.env.GATEWAY_TOKEN||''},
   body:JSON.stringify(body),
   cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  return NextResponse.json(data,{status:response.status});
 }catch{
  return NextResponse.json({ok:false,message:'تعذر الوصول إلى البوابة المحلية. تأكد أنها تعمل ويمكن الوصول إليها من الخادم.'},{status:502});
 }
}
