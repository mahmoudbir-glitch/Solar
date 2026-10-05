import {NextResponse} from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request:Request){
 const gateway=process.env.GATEWAY_URL?.trim();
 if(!gateway) return NextResponse.json({ok:false,message:'لم يتم إعداد عنوان البوابة المحلية. الاتصال الحقيقي يحتاج Gateway داخل المنزل.'},{status:503});
 try{
  const body=await request.json().catch(()=>({}));
  const response=await fetch(gateway.replace(/\/$/,'')+'/api/connection/test',{
   method:'POST',
   headers:{'Content-Type':'application/json','x-gateway-token':process.env.GATEWAY_TOKEN||''},
   body:JSON.stringify({
    transport:'pi30_serial',
    serial_port:typeof body.serial_port==='string'&&body.serial_port.trim()?body.serial_port.trim():undefined,
    baudrate:Number(body.baudrate)||2400,
    timeout_ms:Number(body.timeout_ms)||3000,
   }),
   cache:'no-store',
  });
  const data=await response.json().catch(()=>({}));
  return NextResponse.json(data,{status:response.status,headers:{'Cache-Control':'no-store'}});
 }catch{
  return NextResponse.json({ok:false,message:'تعذر الوصول إلى Gateway. تأكد أن الـ Wi-Fi Datalogger/Gateway متصل وأن خدمة Solar Gateway تعمل.'},{status:502});
 }
}
