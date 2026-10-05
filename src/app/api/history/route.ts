import {NextResponse} from 'next/server';
import {getGatewayHistory} from '@/lib/gateway';

export async function GET(request: Request){
 const url=new URL(request.url);
 const hours=Math.min(Math.max(Number(url.searchParams.get('hours')||24),1),720);
 return NextResponse.json(await getGatewayHistory(hours),{headers:{'Cache-Control':'no-store'}});
}
