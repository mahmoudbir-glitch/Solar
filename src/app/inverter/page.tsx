'use client';

import {useEffect,useState} from 'react';
import type {Telemetry} from '@/lib/types';
import {emptyTelemetry} from '@/lib/types';

type MetricColor = string;
type MetricValue = number | null;
type InverterMetric = [title:string, unit:string, value:MetricValue, color:MetricColor];

export default function Inverter(){
 const [telemetry,setTelemetry]=useState<Telemetry>(emptyTelemetry);
 useEffect(()=>{let active=true;const load=async()=>{try{const r=await fetch('/api/telemetry',{cache:'no-store'});if(r.ok&&active)setTelemetry(await r.json())}catch{}};load();const id=window.setInterval(load,5000);return()=>{active=false;window.clearInterval(id)}},[]);
 const online=telemetry.source==='gateway'&&Boolean(telemetry.timestamp);
 const values:InverterMetric[]=[
  ['PV Voltage','V',telemetry.pvVoltageV,'#f59e0b'],
  ['PV Current','A',telemetry.pvCurrentA,'#f59e0b'],
  ['AC Output','V',telemetry.outputVoltageV,'#29b6f6'],
  ['Frequency','Hz',telemetry.outputFrequencyHz,'#29b6f6'],
  ['Temperature','°C',telemetry.inverterTemperatureC,'#ef5350'],
  ['Load','kW',telemetry.loadPowerW===null?null:telemetry.loadPowerW/1000,'#26a69a']
 ];
 return <>
  <h1 className="page-title">الإنفرتر</h1><p className="page-subtitle">Victor Max-8.2KWM · قراءة حقيقية عند الاتصال بالبوابة</p>
  <div className={"offline-banner "+(online?'online-banner':'')}><span>{online?'النظام متصل — قراءة حقيقية':'النظام غير متصل — لا توجد قراءة حقيقية'}</span></div>
  <div className="grid-2">{values.map(([t,u,v,c])=><div className="metric-card" key={t}><div className="metric-head">{t}</div><div className="metric-value" style={{color:online?c:'#aeb8bb'}}>{v===null?'--':Number(v).toFixed(online&&typeof v==='number'&&t==='Load'?2:1)} <small>{u}</small></div></div>)}</div>
  <div className="card" style={{marginTop:12}}><h2 className="section-title">معلومات الجهاز</h2><div className="grid-2">
   <div><span className="muted">الطراز</span><div>Victor Max-8.2KWM</div></div>
   <div><span className="muted">القدرة</span><div>8200 <span className="unit">W</span> / 8200 <span className="unit">VA</span></div></div>
   <div><span className="muted">الرقم التسلسلي</span><div><bdi dir="ltr">92085230517098</bdi></div></div>
   <div><span className="muted">البروتوكول</span><div>PI30</div></div>
   <div><span className="muted">دخل PV الأقصى</span><div>8200 <span className="unit">W</span></div></div>
   <div><span className="muted">جهد PV الأقصى</span><div>500 <span className="unit">VDC</span></div></div>
   <div><span className="muted">مدى MPPT</span><div>360–450 <span className="unit">VDC</span></div></div>
   <div><span className="muted">نطاق البطارية</span><div>40–63 <span className="unit">VDC</span></div></div>
  </div></div>
 </>;
}