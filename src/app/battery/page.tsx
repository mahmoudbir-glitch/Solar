'use client';
import {useEffect,useState} from 'react';
import {EmptyState} from '@/components/EmptyState';
import type {Telemetry} from '@/lib/types';
import {emptyTelemetry} from '@/lib/types';

type History={timestamp:string;batterySoc:number|null;batteryPowerW:number|null};

export default function BatteryPage(){
 const [telemetry,setTelemetry]=useState<Telemetry>(emptyTelemetry);
 const [history,setHistory]=useState<History[]>([]);
 useEffect(()=>{let active=true;const load=async()=>{try{const [a,b]=await Promise.all([fetch('/api/telemetry',{cache:'no-store'}),fetch('/api/history?hours=24',{cache:'no-store'})]);if(a.ok&&active)setTelemetry(await a.json());if(b.ok&&active){const d=await b.json();setHistory(Array.isArray(d.items)?d.items:[])}}catch{}};load();const id=window.setInterval(load,10000);return()=>{active=false;window.clearInterval(id)}},[]);
 const online=telemetry.source==='gateway'&&Boolean(telemetry.timestamp);
 const soc=telemetry.batterySoc;
 return <>
  <h1 className="page-title">البطارية</h1><p className="page-subtitle">حالة البطارية والشحن والتفريغ</p>
  <div className={`offline-banner ${online?'online-banner':''}`}><span>{online?'البطارية متصلة — قراءة حقيقية':'النظام غير متصل — لا توجد قراءة حقيقية'}</span></div>
  <div className="card" style={{marginBottom:12}}>
   <div className="progress-ring" style={{'--soc':`${soc??0}%`} as React.CSSProperties}><div className="progress-content"><div className="progress-value">{soc===null?'--':`${soc.toFixed(0)}%`}</div><div className="progress-label">نسبة الشحن SOC</div></div></div>
   <div className="grid-3">
    <div className="metric-card"><div className="metric-head">الجهد</div><div className="metric-value" style={{color:online?'#26a69a':'#aeb8bb'}}>{telemetry.batteryVoltageV===null?'--':telemetry.batteryVoltageV.toFixed(1)} <small>V</small></div></div>
    <div className="metric-card"><div className="metric-head">التيار</div><div className="metric-value" style={{color:online?'#26a69a':'#aeb8bb'}}>{telemetry.batteryCurrentA===null?'--':telemetry.batteryCurrentA.toFixed(1)} <small>A</small></div></div>
    <div className="metric-card"><div className="metric-head">القدرة</div><div className="metric-value" style={{color:online?'#26a69a':'#aeb8bb'}}>{telemetry.batteryPowerW===null?'--':(telemetry.batteryPowerW/1000).toFixed(2)} <small>kW</small></div></div>
   </div>
  </div>
  <div className="card" style={{marginBottom:12}}><h2 className="section-title">الشحن خلال آخر 24 ساعة</h2>{history.length<2?<EmptyState text="لا توجد قراءات محفوظة لعرض السجل"/>:<div className="history-strip">{history.slice(-24).map((point,index)=><span key={`${point.timestamp}-${index}`} style={{height:`${Math.max(8,Math.min(100,Math.abs(point.batteryPowerW??0)/50))}%`}} title={point.batterySoc===null?'--':`${point.batterySoc}%`}/>)}</div>}</div>
  <div className="card"><h2 className="section-title">مواصفات البطارية</h2><div className="grid-2"><div><span className="muted">النوع</span><div>--</div></div><div><span className="muted">السعة</span><div>-- <span className="unit">kWh</span></div></div><div><span className="muted">الجهد الاسمي</span><div>48 <span className="unit">V</span></div></div><div><span className="muted">حد الاحتياطي</span><div>20%</div></div></div></div>
 </>
}
