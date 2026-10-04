import { emptyTelemetry, Telemetry } from './types';

export async function getGatewayTelemetry():Promise<Telemetry>{
 const url=process.env.GATEWAY_URL;
 if(!url) return emptyTelemetry;
 try{
  const r=await fetch(url.replace(/\/$/,'')+'/api/telemetry',{cache:'no-store',headers:{'x-gateway-token':process.env.GATEWAY_TOKEN||''}});
  if(!r.ok)return emptyTelemetry;
  const d=await r.json();
  if(d?.source!=='gateway' || !d?.timestamp) return emptyTelemetry;
  return {...emptyTelemetry,...d,source:'gateway'} as Telemetry;
 }catch{return emptyTelemetry;}
}