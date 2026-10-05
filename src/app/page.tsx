'use client';

import {useEffect, useState} from 'react';
import {CircleAlert} from 'lucide-react';
import {EnergyFlow} from '@/components/EnergyFlow';
import type {Telemetry} from '@/lib/types';
import {emptyTelemetry} from '@/lib/types';
import {dailyEnergy} from '@/lib/energy';

type History={timestamp:string;solarPowerW:number|null;loadPowerW:number|null};

export default function Dashboard(){
 const [telemetry,setTelemetry]=useState<Telemetry>(emptyTelemetry);
 const [history,setHistory]=useState<History[]>([]);
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{
    const [telemetryResponse,historyResponse]=await Promise.all([
     fetch('/api/telemetry',{cache:'no-store'}),
     fetch('/api/history?hours=24',{cache:'no-store'})
    ]);
    if(telemetryResponse.ok&&active)setTelemetry(await telemetryResponse.json());
    if(historyResponse.ok&&active){const data=await historyResponse.json();setHistory(Array.isArray(data.items)?data.items:[])}
   }catch{}
  };
  load();
  const id=window.setInterval(load,10000);
  return()=>{active=false;window.clearInterval(id)};
 },[]);
 const online=telemetry.source==='gateway' && Boolean(telemetry.timestamp);
 const energy=dailyEnergy(history);
 const hasEnergy=history.length>1&&(energy.solarKwh>0||energy.loadKwh>0);
 return <>
  <h1 className="page-title">الرئيسية</h1>
  <p className="page-subtitle">نظرة مباشرة على منظومة الطاقة</p>
  <div className={`offline-banner ${online?'online-banner':''}`}>
   <CircleAlert size={16}/>
   <span>{online?'النظام متصل — بيانات حقيقية من البوابة':'النظام غير متصل — لا توجد قراءات حقيقية حالياً'}</span>
  </div>
  <div className="card"><EnergyFlow telemetry={telemetry}/></div>
  <div className="grid-2" style={{marginTop:12}}>
   <div className="metric-card"><div className="metric-head">إنتاج اليوم</div><div className="metric-value" style={{color:hasEnergy?'#f59e0b':'#aeb8bb'}}>{hasEnergy?energy.solarKwh.toFixed(2):'--'} <small>kWh</small></div></div>
   <div className="metric-card"><div className="metric-head">استهلاك اليوم</div><div className="metric-value" style={{color:hasEnergy?'#29b6f6':'#aeb8bb'}}>{hasEnergy?energy.loadKwh.toFixed(2):'--'} <small>kWh</small></div></div>
  </div>
 </>;
}
