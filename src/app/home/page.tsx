'use client';
import {useEffect,useState} from 'react';
import {Home,Zap,Battery} from 'lucide-react';
import {EmptyState} from '@/components/EmptyState';
import type {Telemetry} from '@/lib/types';
import {emptyTelemetry} from '@/lib/types';
import {dailyEnergy} from '@/lib/energy';

type History={timestamp:string;solarPowerW:number|null;loadPowerW:number|null};

export default function HomePage(){
 const [telemetry,setTelemetry]=useState<Telemetry>(emptyTelemetry);const [history,setHistory]=useState<History[]>([]);
 useEffect(()=>{let active=true;const load=async()=>{try{const[a,b]=await Promise.all([fetch('/api/telemetry',{cache:'no-store'}),fetch('/api/history?hours=24',{cache:'no-store'})]);if(a.ok&&active)setTelemetry(await a.json());if(b.ok&&active){const d=await b.json();setHistory(Array.isArray(d.items)?d.items:[])}}catch{}};load();const id=window.setInterval(load,10000);return()=>{active=false;window.clearInterval(id)}},[]);
 const online=telemetry.source==='gateway'&&Boolean(telemetry.timestamp);const energy=dailyEnergy(history);const hasHistory=history.length>1;
 const load=telemetry.loadPowerW===null?'--':(telemetry.loadPowerW/1000).toFixed(2);
 const solar=telemetry.solarPowerW??0;const battery=telemetry.batteryPowerW??0;const grid=telemetry.gridPowerW??0;const total=Math.max(1,solar+Math.max(0,battery)+Math.max(0,grid));
 return <>
  <h1 className="page-title">المنزل</h1><p className="page-subtitle">استهلاك المنزل ومصادر الطاقة الحالية</p>
  <div className={`offline-banner ${online?'online-banner':''}`}><span>{online?'بيانات حقيقية من الإنفرتر':'النظام غير متصل — لا توجد قراءات حقيقية حالياً'}</span></div>
  <div className="card" style={{textAlign:'center',marginBottom:12}}><div className="metric-head" style={{justifyContent:'center'}}><Home size={16}/> إجمالي السحب الحالي</div><div style={{fontSize:48,fontWeight:800,direction:'ltr',marginTop:4}}>{load} <span className="unit">kW</span></div><div className="muted" style={{fontSize:11}}>التيار {telemetry.batteryCurrentA===null?'--':telemetry.batteryCurrentA.toFixed(1)} A</div></div>
  <div className="card" style={{marginBottom:12}}><h2 className="section-title">من أين يأتي استهلاكك الآن؟</h2>{online?<><div className="segment"><span style={{width:`${Math.round((solar/total)*100)}%`,background:'#f59e0b'}}/><span style={{width:`${Math.round((Math.max(0,battery)/total)*100)}%`,background:'#26a69a'}}/><span style={{width:`${Math.round((Math.max(0,grid)/total)*100)}%`,background:'#90a4ae'}}/></div><div className="legend"><span>الشمس {Math.round((solar/total)*100)} %</span><span>البطارية {Math.round((Math.max(0,battery)/total)*100)} %</span><span>الشبكة {Math.round((Math.max(0,grid)/total)*100)} %</span></div></>:<><div className="segment empty-segment"/><div className="legend"><span>الشمس -- %</span><span>البطارية -- %</span><span>الشبكة -- %</span></div></>}</div>
  <div className="card" style={{marginBottom:12}}><h2 className="section-title">آخر 24 ساعة</h2>{hasHistory?<div className="bar-chart">{history.slice(-24).map((point,index)=><span key={`${point.timestamp}-${index}`} className="bar" style={{height:`${Math.max(5,Math.min(100,(point.loadPowerW??0)/100))}%`,background:'#29b6f6'}}/> )}</div>:<EmptyState/>}<div className="legend"><span>الإنتاج الشمسي {hasHistory?`${energy.solarKwh.toFixed(2)} kWh`:'--'}</span><span>استهلاك المنزل {hasHistory?`${energy.loadKwh.toFixed(2)} kWh`:'--'}</span></div></div>
  <div className="grid-2"><div className="metric-card"><div className="metric-head"><Zap size={15}/> أعلى حمل اليوم</div><div className="metric-value" style={{color:online?'#29b6f6':'#aeb8bb'}}>{telemetry.loadPowerW===null?'--':(telemetry.loadPowerW/1000).toFixed(2)} <small>kW</small></div></div><div className="metric-card"><div className="metric-head"><Battery size={15}/> استهلاك اليوم</div><div className="metric-value" style={{color:hasHistory?'#26a69a':'#aeb8bb'}}>{hasHistory?energy.loadKwh.toFixed(2):'--'} <small>kWh</small></div></div></div>
 </>
}
