import {emptyTelemetry, Telemetry} from './types';

export type HistoryPoint={
 timestamp:string;
 solarPowerW:number|null;
 loadPowerW:number|null;
 batteryPowerW:number|null;
 batterySoc:number|null;
 batteryVoltageV:number|null;
 batteryCurrentA:number|null;
 gridPowerW:number|null;
 pvVoltageV:number|null;
 pvCurrentA:number|null;
 outputVoltageV:number|null;
 outputFrequencyHz:number|null;
 inverterTemperatureC:number|null;
 inverterState:string|null;
 warnings:string[];
 alarms:string[];
};

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

export async function getGatewayHistory(hours=24):Promise<{hours:number;items:HistoryPoint[]}>{
 const url=process.env.GATEWAY_URL;
 if(!url) return {hours,items:[]};
 try{
  const r=await fetch(url.replace(/\/$/,'')+`/api/history?hours=${hours}`,{cache:'no-store',headers:{'x-gateway-token':process.env.GATEWAY_TOKEN||''}});
  if(!r.ok)return {hours,items:[]};
  const d=await r.json();
  return {hours:Number(d?.hours||hours),items:Array.isArray(d?.items)?d.items:[]};
 }catch{return {hours,items:[]};}
}
