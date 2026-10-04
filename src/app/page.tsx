'use client';

import {useEffect, useState} from 'react';
import {CircleAlert} from 'lucide-react';
import {EnergyFlow} from '@/components/EnergyFlow';
import type {Telemetry} from '@/lib/types';
import {emptyTelemetry} from '@/lib/types';

export default function Dashboard(){
 const [telemetry,setTelemetry]=useState<Telemetry>(emptyTelemetry);
 useEffect(()=>{
  let active=true;
  const load=async()=>{try{const r=await fetch('/api/telemetry',{cache:'no-store'});if(r.ok&&active)setTelemetry(await r.json())}catch{}};
  load();
  const id=window.setInterval(load,5000);
  return()=>{active=false;window.clearInterval(id)};
 },[]);
 const online=telemetry.source==='gateway' && Boolean(telemetry.timestamp);
 return <>
  <h1 className="page-title">الرئيسية</h1>
  <p className="page-subtitle">نظرة مباشرة على منظومة الطاقة</p>
  <div className={`offline-banner ${online?'online-banner':''}`}>
   <CircleAlert size={16}/>
   <span>{online?'النظام متصل — بيانات حقيقية من البوابة':'النظام غير متصل — لا توجد قراءات حقيقية حالياً'}</span>
  </div>
  <div className="card">
   <EnergyFlow telemetry={telemetry}/>
  </div>
  <div className="grid-2" style={{marginTop:12}}>
   <div className="metric-card"><div className="metric-head">إنتاج اليوم</div><div className="metric-value" style={{color:online?'#f59e0b':'#aeb8bb'}}>{online?'--':'--'} <small>kWh</small></div></div>
   <div className="metric-card"><div className="metric-head">استهلاك اليوم</div><div className="metric-value" style={{color:online?'#29b6f6':'#aeb8bb'}}>{online?'--':'--'} <small>kWh</small></div></div>
  </div>
 </>;
}